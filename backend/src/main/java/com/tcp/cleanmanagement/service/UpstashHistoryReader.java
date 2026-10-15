package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.config.UpstashSyncProperties;
import io.lettuce.core.*;
import io.lettuce.core.api.StatefulRedisConnection;
import io.lettuce.core.api.sync.RedisCommands;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Duration;
import java.util.*;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.json.JsonMapper;

@Component
public class UpstashHistoryReader {
    private final UpstashSyncProperties properties;
    private final JsonMapper jsonMapper;
    private final HttpClient httpClient;
    private RedisClient client;
    private StatefulRedisConnection<String, String> connection;

    @Autowired
    public UpstashHistoryReader(UpstashSyncProperties properties, JsonMapper jsonMapper) {
        this(properties, jsonMapper, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build());
    }

    UpstashHistoryReader(UpstashSyncProperties properties, JsonMapper jsonMapper, HttpClient httpClient) {
        this.properties = properties;
        this.jsonMapper = jsonMapper;
        this.httpClient = httpClient;
    }

    private synchronized RedisCommands<String, String> commands() {
        if (connection == null) {
            RedisURI uri;
            try {
                uri = RedisURI.create(properties.getRedisUrl());
            } catch (RuntimeException error) {
                throw new IllegalArgumentException("Invalid Upstash connection URL");
            }
            if (!uri.isSsl() || uri.getHost() == null || !uri.getHost().endsWith(".upstash.io")) {
                throw new IllegalArgumentException("Use an Upstash rediss URL with TLS enabled");
            }
            uri.setTimeout(Duration.ofSeconds(8));
            if (client == null) client = RedisClient.create(uri);
            connection = client.connect();
        }
        return connection.sync();
    }

    public Set<String> discoverDevices() {
        if (usesRest()) return discoverRestDevices();
        Set<String> devices = new TreeSet<>();
        ScanCursor cursor = ScanCursor.INITIAL;
        do {
            KeyScanCursor<String> page = commands().scan(cursor,
                    ScanArgs.Builder.matches("esp32:*:history").limit(100));
            for (String key : page.getKeys()) {
                String mac = key.substring("esp32:".length(), key.length() - ":history".length());
                if (mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}")) devices.add(mac.toUpperCase(Locale.ROOT));
            }
            cursor = page;
        } while (!cursor.isFinished());
        return devices;
    }

    public List<ScoredValue<String>> readPage(String mac, double minimumScore, long offset) {
        int size = Math.max(1, Math.min(properties.getBatchSize(), 1000));
        if (usesRest()) {
            List<?> result = (List<?>) restCommand("ZRANGEBYSCORE", "esp32:" + mac + ":history",
                    String.valueOf(minimumScore), "+inf", "WITHSCORES", "LIMIT", String.valueOf(offset), String.valueOf(size));
            List<ScoredValue<String>> page = new ArrayList<>();
            if (result.size() % 2 != 0) throw new IllegalStateException("Invalid Upstash history response");
            for (int i = 0; i < result.size(); i += 2) {
                page.add(ScoredValue.just(Double.parseDouble(String.valueOf(result.get(i + 1))), (String) result.get(i)));
            }
            return page;
        }
        return commands().zrangebyscoreWithScores("esp32:" + mac + ":history",
                Range.create(minimumScore, Double.POSITIVE_INFINITY), Limit.create(offset, size));
    }

    private boolean usesRest() {
        return properties.getRedisUrl().startsWith("https://");
    }

    private Set<String> discoverRestDevices() {
        Set<String> devices = new TreeSet<>();
        String cursor = "0";
        do {
            List<?> result = (List<?>) restCommand("SCAN", cursor, "MATCH", "esp32:*:history", "COUNT", "100");
            cursor = String.valueOf(result.get(0));
            for (Object value : (List<?>) result.get(1)) {
                String key = (String) value;
                String mac = key.substring("esp32:".length(), key.length() - ":history".length());
                if (mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}")) devices.add(mac.toUpperCase(Locale.ROOT));
            }
        } while (!"0".equals(cursor));
        return devices;
    }

    private Object restCommand(String... command) {
        try {
            URI uri = URI.create(properties.getRedisUrl());
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || !uri.getHost().endsWith(".upstash.io")
                    || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException();
            }
            String token = properties.getRestToken();
            String userInfo = uri.getUserInfo();
            if (userInfo != null && userInfo.contains(":")) token = userInfo.substring(userInfo.indexOf(':') + 1);
            if (token == null || token.isBlank()) throw new IllegalArgumentException();
            URI endpoint = new URI("https", null, uri.getHost(), uri.getPort(), "/", null, null);
            HttpRequest request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(8))
                    .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonMapper.writeValueAsString(command), StandardCharsets.UTF_8)).build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException("Upstash REST request failed");
            Map<?, ?> body = jsonMapper.readValue(response.body(), Map.class);
            if (body.containsKey("error") || !body.containsKey("result")) throw new IllegalStateException("Upstash REST command failed");
            return body.get("result");
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Upstash request interrupted");
        } catch (Exception error) {
            throw new IllegalStateException("Upstash REST connection or command failed");
        }
    }

    @PreDestroy
    public void close() {
        if (connection != null) connection.close();
        if (client != null) client.shutdown();
    }
}
