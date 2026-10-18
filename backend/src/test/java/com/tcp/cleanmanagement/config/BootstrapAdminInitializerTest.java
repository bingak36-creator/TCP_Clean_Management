package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.entity.User;
import com.tcp.cleanmanagement.enums.Role;
import com.tcp.cleanmanagement.repository.UserRepository;
import com.tcp.cleanmanagement.service.PasswordService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BootstrapAdminInitializerTest {
    private final UserRepository users = mock(UserRepository.class);
    private final PasswordService passwords = new PasswordService();
    @Test void noImplicitDefaultAccount() {
        new BootstrapAdminInitializer(users, passwords, "", "").run();
        verifyNoInteractions(users);
    }
    @Test void explicitBootstrapCreatesHashedDeveloperOnlyInEmptyDatabase() {
        new BootstrapAdminInitializer(users, passwords, "initial-admin", "long-bootstrap-password").run();
        var capture = ArgumentCaptor.forClass(User.class); verify(users).save(capture.capture());
        assertEquals("initial-admin", capture.getValue().getUsername());
        assertEquals(Role.DEVELOPER, capture.getValue().getRole());
        assertNotEquals("long-bootstrap-password", capture.getValue().getPassword());
        assertTrue(passwords.matches("long-bootstrap-password", capture.getValue().getPassword()));
    }
    @Test void bootstrapNeverOverwritesExistingUsers() {
        when(users.count()).thenReturn(1L);
        new BootstrapAdminInitializer(users, passwords, "initial-admin", "long-bootstrap-password").run();
        verify(users, never()).save(any());
    }
    @Test void rejectsPartialOrWeakBootstrapConfiguration() {
        for (String[] config : new String[][] {{"admin", ""}, {"", "long-bootstrap-password"}, {"admin", "1234"}}) {
            assertThrows(IllegalStateException.class,
                () -> new BootstrapAdminInitializer(users, passwords, config[0], config[1]).run());
        }
        verifyNoInteractions(users);
    }
}
