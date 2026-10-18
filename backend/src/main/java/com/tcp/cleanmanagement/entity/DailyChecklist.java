package com.tcp.cleanmanagement.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "daily_checklists",
       uniqueConstraints = {@UniqueConstraint(columnNames = {"zoneId", "checkDate", "itemKey"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DailyChecklist {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long zoneId;

    @Column(nullable = false)
    @JdbcTypeCode(SqlTypes.LOCAL_DATE)
    private LocalDate checkDate;

    @Column(nullable = false, length = 64)
    private String itemKey;

    @Column(nullable = false)
    @Builder.Default
    private boolean isCompleted = false;

    private Long completedBy;

    private LocalDateTime completedAt;
}
