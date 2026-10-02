package com.qrshare.controller;

import com.qrshare.dto.QrValueRequest;
import com.qrshare.dto.QrValueResponse;
import com.qrshare.service.QrCodeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/qr")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "QR Code", description = "Generate QR codes from text values")
public class QrController {

    private final QrCodeService qrCodeService;

    @PostMapping("/value")
    @Operation(summary = "Generate a QR code from a text/URL/JSON/number value")
    public ResponseEntity<QrValueResponse> generateValueQr(@RequestBody @Valid QrValueRequest request) {
        log.debug("Generating QR for value type detection");

        String type = qrCodeService.detectType(request.getValue());
        String qrCode = qrCodeService.generateQrCode(request.getValue());

        QrValueResponse response = new QrValueResponse(type, request.getValue(), qrCode);
        return ResponseEntity.ok(response);
    }
}
