package com.tcp.cleanmanagement.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class WebSpaController {

    @GetMapping({"/admin", "/login", "/map", "/dashboard"})
    public String forwardSpa() {
        return "forward:/index.html";
    }
}
