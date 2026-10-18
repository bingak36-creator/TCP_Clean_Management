package com.tcp.cleanmanagement.controller;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.Role;
import com.tcp.cleanmanagement.repository.*;
import com.tcp.cleanmanagement.security.AccessService;
import com.tcp.cleanmanagement.service.PasswordService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.util.*;
@RestController @RequestMapping("/api/admin/users") @RequiredArgsConstructor
public class UserAccessController {
    private final UserRepository users; private final ZoneRepository zones;
    private final ZonePermissionRepository permissions; private final PasswordService passwords;
    private final AccessService access;
    private final AuthSessionRepository sessions;
    public record UserView(Long id,String username,Role role,List<Long> zoneIds) {}
    public record CreateUser(@NotBlank @Size(max=255) String username,@NotBlank @Size(min=12) String password,
        @NotNull Role role, @NotNull Set<@NotNull @Positive Long> zoneIds) {}
    public record AccessUpdate(@NotNull Role role,@NotNull Set<@NotNull @Positive Long> zoneIds) {}
    @GetMapping @Transactional(readOnly=true)
    public List<UserView> list() { access.requireDeveloper(); return users.findAll().stream().map(this::view).toList(); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
    public UserView create(@Valid @RequestBody CreateUser request) {
        access.requireDeveloper();
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Password exceeds 72 UTF-8 bytes");
        if (users.findByUsername(request.username().trim()).isPresent()) throw new ResponseStatusException(HttpStatus.CONFLICT,"Username already exists");
        validateZones(request.zoneIds());
        User user = users.saveAndFlush(User.builder().username(request.username().trim()).password(passwords.encode(request.password())).role(request.role()).build());
        replaceZones(user,request.zoneIds()); return view(user);
    }
    @PutMapping("/{id}/access") @Transactional
    public UserView update(@PathVariable Long id,@Valid @RequestBody AccessUpdate request) {
        access.requireDeveloper(); validateZones(request.zoneIds());
        User user = users.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (id.equals(access.current().id()) && request.role()!=Role.DEVELOPER) throw new ResponseStatusException(HttpStatus.CONFLICT,"Cannot remove your own developer access");
        user.setRole(request.role()); replaceZones(user,request.zoneIds()); return view(user);
    }
    public record EditUser(@NotBlank @Size(max=255) String username,String password,
        @NotNull Role role,@NotNull Set<@NotNull @Positive Long> zoneIds) {}
    @PutMapping("/{id}") @Transactional
    public UserView edit(@PathVariable Long id,@Valid @RequestBody EditUser request) {
        access.requireDeveloper();validateZones(request.zoneIds());
        var user=users.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        if(id.equals(access.current().id())&&request.role()!=Role.DEVELOPER)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"Cannot remove your own developer access");
        String username=request.username().trim();
        users.findByUsername(username).filter(other->!other.getId().equals(id)).ifPresent(other->{throw new ResponseStatusException(HttpStatus.CONFLICT,"Username already exists");});
        if(request.password()!=null&&!request.password().isEmpty()) {
            if(request.password().length()<12||request.password().getBytes(StandardCharsets.UTF_8).length>72)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Password must contain at least 12 characters and at most 72 UTF-8 bytes");
            user.setPassword(passwords.encode(request.password()));sessions.deleteByUserId(id);
        }
        user.setUsername(username);user.setRole(request.role());replaceZones(user,request.zoneIds());return view(user);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
    public void delete(@PathVariable Long id) {
        access.requireDeveloper();
        if(id.equals(access.current().id()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Cannot delete the signed-in developer");
        var user=users.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));
        permissions.deleteByUserId(id);sessions.deleteByUserId(id);
        try {users.delete(user);users.flush();}
        catch(org.springframework.dao.DataIntegrityViolationException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,"User is referenced by audit history; keep the account to preserve that history",error);
        }
    }
    private void validateZones(Set<Long> ids) { if (zones.findAllById(ids).size()!=ids.size()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown zone"); }
    private void replaceZones(User user,Set<Long> ids) {
        permissions.deleteByUserId(user.getId()); permissions.flush();
        for (Long id:ids) permissions.save(ZonePermission.builder().user(user).zone(zones.getReferenceById(id)).build());
        permissions.flush();
    }
    private UserView view(User user) { return new UserView(user.getId(),user.getUsername(),user.getRole(),permissions.findByUserId(user.getId()).stream().filter(p->p.getZone()!=null).map(p->p.getZone().getId()).toList()); }
}
