package com.qrshare.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Response containing the generated QR code for a direct value")
public class QrValueResponse {

    @Schema(description = "Detected type of the input value", example = "URL")
    private String type;

    @Schema(description = "The original input value", example = "https://example.com")
    private String value;

    @Schema(description = "Base64-encoded PNG QR code as a data URL")
    private String qrCode;
}
