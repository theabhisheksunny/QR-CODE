package com.qrshare.controller;

import com.qrshare.config.AppProperties;
import com.qrshare.service.NetworkInterfaceInfo;
import com.qrshare.service.NetworkService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/network")
@RequiredArgsConstructor
@Tag(name = "Network", description = "Local network interface detection and selection")
public class NetworkController {

    private final NetworkService networkService;
    private final AppProperties appProperties;

    public record NetworkInfoResponse(
        String localIp,
        int port,
        String shareBaseUrl,
        List<NetworkInterfaceInfo> allInterfaces
    ) {}

    public record SelectRequest(String ipAddress) {}

    @GetMapping("/info")
    @Operation(summary = "Get current LAN IP, port, share base URL, and all available interfaces")
    public NetworkInfoResponse getNetworkInfo() {
        return buildResponse();
    }

    @GetMapping("/interfaces")
    @Operation(summary = "List all usable network interfaces with their IPv4 addresses")
    public List<NetworkInterfaceInfo> getInterfaces() {
        return networkService.getAllInterfaces();
    }

    @PostMapping("/select")
    @Operation(summary = "Select which network interface IP to use in generated share URLs")
    public NetworkInfoResponse selectInterface(@RequestBody SelectRequest request) {
        networkService.setIpOverride(request.ipAddress());
        return buildResponse();
    }

    private NetworkInfoResponse buildResponse() {
        int port = appProperties.getServerPort();
        return new NetworkInfoResponse(
            networkService.getLocalIpAddress(),
            port,
            networkService.getShareBaseUrl(port),
            networkService.getAllInterfaces()
        );
    }
}
