package com.example.jmeditor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EditorFormatRepository extends JpaRepository<EditorFormat, Long> {
    /** 사용 중인 서식을 정렬 순으로 */
    List<EditorFormat> findByUseYnOrderBySortOrderAscIdAsc(String useYn);
}
