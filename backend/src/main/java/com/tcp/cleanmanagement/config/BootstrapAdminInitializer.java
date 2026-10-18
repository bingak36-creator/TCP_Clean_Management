package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.entity.User;
import com.tcp.cleanmanagement.enums.Role;
import com.tcp.cleanmanagement.repository.UserRepository;
import com.tcp.cleanmanagement.service.PasswordService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;

@Component
public class BootstrapAdminInitializer implements CommandLineRunner {
    private final UserRepository users;
    private final PasswordService passwords;
    private final String username;
    private final String password;
    public BootstrapAdminInitializer(UserRepository users, PasswordService passwords,
            @Value("${app.auth.bootstrap-username:}") String username,
            @Value("${app.auth.bootstrap-password:}") String password) {
        this.users = users; this.passwords = passwords; this.username = username; this.password = password;
    }
    @Override @Transactional
    public void run(String... args) {
        if (username.isBlank() && password.isBlank()) return;
        if (username.isBlank() || username.length() > 255 || password.length() < 12
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalStateException("Bootstrap requires a username and a 12-character password (maximum 72 UTF-8 bytes)");
        }
        // Explicit, local configuration only. Never create or promote users from login input.
        if (users.count() == 0) users.save(User.builder().username(username.trim())
                .password(passwords.encode(password)).role(Role.DEVELOPER).build());
    }
}
