package com.qrshare.service;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class NetworkInterfaceInfo {
    private String name;
    private String displayName;
    private String ipAddress;
    private boolean preferred;
}
