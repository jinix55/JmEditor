package com.example.jmeditor;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 서식(템플릿) 엔티티 (editor_format) — 별도 서식 관리 화면에서 등록/수정 */
@Entity
@Table(name = "editor_format")
@Getter @Setter @NoArgsConstructor
public class EditorFormat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 300)
    private String description;

    /** 에디터 허용 태그 범위로 작성된 HTML */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String html;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "use_yn", nullable = false, length = 1)
    private String useYn = "Y";
}
