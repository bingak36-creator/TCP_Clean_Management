package com.tcp.cleanmanagement.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/kakao-transit")
public class KakaoTransitProxyController {

    private final String kakaoRestApiKey;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public KakaoTransitProxyController(
            @Value("${kakao.rest.api-key:${KAKAO_REST_API_KEY:}}") String kakaoRestApiKey) {
        this.kakaoRestApiKey = kakaoRestApiKey != null ? kakaoRestApiKey.trim() : "";
    }

    @GetMapping(produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> proxyTransit(@RequestParam Map<String, String> queryParams) {
        if(queryParams.size()>12 || queryParams.entrySet().stream().anyMatch(e->e.getKey().length()>64||e.getValue()!=null&&e.getValue().length()>500))
            return ResponseEntity.badRequest().body("{\"error\":\"INVALID_QUERY\"}");
        if (kakaoRestApiKey.isEmpty()) {
            return ResponseEntity.ok("{\"in_local\":false,\"reason\":\"KAKAO_REST_API_KEY_NOT_CONFIGURED\"}");
        }
        try {
            String query = queryParams.entrySet().stream()
                    .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "="
                            + URLEncoder.encode(e.getValue() != null ? e.getValue() : "", StandardCharsets.UTF_8))
                    .collect(Collectors.joining("&"));
            String targetUrl = "https://dapi.kakao.com/v2/routing/publictraffic" + (query.isEmpty() ? "" : "?" + query);

            HttpRequest.Builder reqBuilder = HttpRequest.newBuilder()
                    .uri(URI.create(targetUrl))
                    .timeout(Duration.ofSeconds(5))
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .header("KA", "sdk/1.0.0 os/javascript lang/ko-KR res/1920x1080 device/desktop origin/http://localhost:5173")
                    .GET();

            HttpResponse<String> response = httpClient.send(reqBuilder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                return ResponseEntity.status(response.statusCode())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(response.body());
            }
            return ResponseEntity.ok("{\"in_local\":false,\"upstreamStatus\":" + response.statusCode() + "}");
        } catch (Exception e) {
            return ResponseEntity.ok("{\"in_local\":false,\"error\":\"UPSTREAM_UNAVAILABLE\"}");
        }
    }
}
