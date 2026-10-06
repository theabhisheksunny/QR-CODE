package com.qrshare.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

/**
 * Forwards SPA client-side routes to index.html so React Router can handle them.
 * Spring Boot serves static assets (index.html, assets/, etc.) from classpath:/static/ automatically.
 * This controller only handles named routes — NOT a catch-all — to avoid conflicting with
 * the default static resource handler and API controllers.
 */
@Controller
public class SpaController {

    @GetMapping({"/text", "/file", "/history", "/settings", "/room", "/scan", "/paste"})
    public String forwardSpaRoutes() {
        return "forward:/index.html";
    }

    @GetMapping("/share/{token:[a-zA-Z0-9_-]+}")
    public String forwardShareRoute(@PathVariable String token) {
        return "forward:/index.html";
    }

    @GetMapping("/room/{token:[a-zA-Z0-9_-]+}")
    public String forwardRoomRoute(@PathVariable String token) {
        return "forward:/index.html";
    }
}
