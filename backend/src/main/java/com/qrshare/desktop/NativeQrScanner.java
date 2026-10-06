package com.qrshare.desktop;

import com.github.sarxos.webcam.Webcam;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.NotFoundException;
import com.google.zxing.Result;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;
import lombok.extern.slf4j.Slf4j;

import javax.imageio.ImageIO;
import java.awt.Dimension;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Native webcam QR scanner for the Windows desktop host.
 *
 * <p>JavaFX WebView (WebKit) does not implement {@code getUserMedia}, so the
 * desktop app cannot scan with an in-page browser scanner. This opens a real
 * native JavaFX window that:</p>
 * <ol>
 *   <li>opens the default system webcam via webcam-capture,</li>
 *   <li>renders a live preview,</li>
 *   <li>decodes each frame with the bundled ZXing {@link MultiFormatReader}
 *       (QR only), and</li>
 *   <li>invokes {@code onResult} with the decoded string on the FX thread,
 *       then closes.</li>
 * </ol>
 *
 * <p>Camera errors (no camera, busy, denied) surface in the window with a Retry
 * and Cancel; the scanner never silently fails.</p>
 */
@Slf4j
public class NativeQrScanner {

    private final Consumer<String> onResult;
    private Stage stage;
    private volatile boolean running;
    private Webcam webcam;
    private Thread captureThread;

    private ImageView preview;
    private Label status;

    public NativeQrScanner(Consumer<String> onResult) {
        this.onResult = onResult;
    }

    /** Opens the scanner window (must be called on the FX thread). */
    public void open() {
        stage = new Stage();
        stage.setTitle("Scan QR Code");

        preview = new ImageView();
        preview.setFitWidth(480);
        preview.setFitHeight(360);
        preview.setPreserveRatio(true);

        status = new Label("Starting camera\u2026");

        Button retry = new Button("Retry Camera");
        retry.setOnAction(e -> restart());
        Button cancel = new Button("Cancel");
        cancel.setOnAction(e -> close());

        VBox root = new VBox(12,
            new Label("Point the camera at a Universal QR Sharing code"),
            preview, status, new VBox(6, retry, cancel));
        root.setAlignment(Pos.CENTER);
        root.setPadding(new Insets(16));

        stage.setScene(new Scene(root, 540, 520));
        stage.setOnCloseRequest(e -> stopCapture());
        stage.show();

        startCapture();
    }

    private void restart() {
        stopCapture();
        startCapture();
    }

    private void startCapture() {
        running = true;
        setStatus("Starting camera\u2026");
        captureThread = new Thread(this::captureLoop, "native-qr-capture");
        captureThread.setDaemon(true);
        captureThread.start();
    }

    private void captureLoop() {
        try {
            webcam = Webcam.getDefault();
            if (webcam == null) {
                setStatus("No camera was found on this device.");
                return;
            }
            webcam.setViewSize(selectBestSize(webcam));
            webcam.open();

            MultiFormatReader reader = new MultiFormatReader();
            Map<DecodeHintType, Object> hints = new EnumMap<>(DecodeHintType.class);
            hints.put(DecodeHintType.POSSIBLE_FORMATS, EnumSet.of(BarcodeFormat.QR_CODE));
            hints.put(DecodeHintType.TRY_HARDER, Boolean.TRUE);
            reader.setHints(hints);

            setStatus("Scanning\u2026");
            // Decode EVERY frame (the single MultiFormatReader is reused — no
            // per-frame reader construction). The live preview is refreshed only
            // on alternate frames to halve the per-frame PNG encode allocation,
            // which does not affect decode speed/latency.
            long frame = 0;
            while (running) {
                BufferedImage image = webcam.getImage();
                if (image == null) {
                    sleep(60);
                    continue;
                }
                frame++;
                // Decode first (latency-critical), then update preview.
                String decoded = decode(reader, image);
                if (decoded != null) {
                    running = false;
                    final String value = decoded;
                    Platform.runLater(() -> {
                        onResult.accept(value);
                        close();
                    });
                    return;
                }
                if ((frame & 1L) == 0L) { // every other frame: refresh preview
                    Image fxImage = toFxImage(image);
                    if (fxImage != null) {
                        Platform.runLater(() -> preview.setImage(fxImage));
                    }
                }
                sleep(60);
            }
        } catch (Throwable t) {
            String msg = describe(t);
            log.warn("Native scanner error: {}", msg);
            setStatus("Camera error: " + msg);
        } finally {
            closeWebcam();
        }
    }

    private String decode(MultiFormatReader reader, BufferedImage image) {
        try {
            BinaryBitmap bitmap = new BinaryBitmap(
                new HybridBinarizer(new BufferedImageLuminanceSource(image)));
            Result result = reader.decodeWithState(bitmap);
            return result != null ? result.getText() : null;
        } catch (NotFoundException e) {
            return null; // no QR in this frame
        } catch (Throwable t) {
            return null;
        } finally {
            reader.reset();
        }
    }

    private Image toFxImage(BufferedImage image) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "png", baos);
            return new Image(new ByteArrayInputStream(baos.toByteArray()));
        } catch (Throwable t) {
            return null;
        }
    }

    private Dimension selectBestSize(Webcam cam) {
        Dimension[] sizes = cam.getViewSizes();
        Dimension best = new Dimension(640, 480);
        for (Dimension d : sizes) {
            if (d.width == 640 && d.height == 480) return d;
            if (d.width * d.height > best.width * best.height && d.width <= 1280) {
                best = d;
            }
        }
        return best;
    }

    private void stopCapture() {
        running = false;
        if (captureThread != null) {
            try {
                captureThread.join(1500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        closeWebcam();
    }

    private void closeWebcam() {
        try {
            if (webcam != null && webcam.isOpen()) {
                webcam.close();
            }
        } catch (Throwable t) {
            log.debug("webcam close: {}", t.toString());
        }
    }

    private void close() {
        stopCapture();
        if (stage != null) {
            stage.close();
        }
    }

    private void setStatus(String text) {
        Platform.runLater(() -> {
            if (status != null) status.setText(text);
        });
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static String describe(Throwable t) {
        return t.getMessage() != null ? t.getMessage() : t.getClass().getSimpleName();
    }
}
