package com.qrshare.service;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Base64;

@Service
@Slf4j
public class QrCodeService {

    private static final int QR_SIZE = 300;

    /**
     * Generates a QR code image for the given content string.
     *
     * @param content the data to encode in the QR code
     * @return a data URL string: "data:image/png;base64,..."
     */
    public String generateQrCode(String content) {
        try {
            QRCodeWriter qrCodeWriter = new QRCodeWriter();
            BitMatrix bitMatrix = qrCodeWriter.encode(content, BarcodeFormat.QR_CODE, QR_SIZE, QR_SIZE);

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(bitMatrix, "PNG", baos);

            String base64 = Base64.getEncoder().encodeToString(baos.toByteArray());
            return "data:image/png;base64," + base64;
        } catch (WriterException e) {
            throw new RuntimeException("Failed to generate QR code: " + e.getMessage(), e);
        } catch (IOException e) {
            throw new RuntimeException("Failed to write QR code image: " + e.getMessage(), e);
        }
    }

    /**
     * Detects the type of the given value string.
     *
     * @param value the input value
     * @return one of: URL, JSON, NUMBER, TEXT
     */
    public String detectType(String value) {
        if (value == null) {
            return "TEXT";
        }
        String trimmed = value.trim();

        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return "URL";
        }
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            return "JSON";
        }
        if (trimmed.matches("-?\\d+(\\.\\d+)?")) {
            return "NUMBER";
        }
        return "TEXT";
    }
}
