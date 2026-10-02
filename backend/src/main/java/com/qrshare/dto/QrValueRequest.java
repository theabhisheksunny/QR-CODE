package com.qrshare.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Request to generate a QR code from a text value")
public class QrValueRequest {

    @NotBlank(message = "Value must not be blank")
    @Schema(description = "The text, URL, number, or JSON value to encode in the QR code",
            example = "https://example.com",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String value;
}
