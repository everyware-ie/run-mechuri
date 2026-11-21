package com.mechuri.runary;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// 대역 없이 실제 빈 구성이 뜨는지 본다(검증기 생성자 등)
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:context",
        "app.jwt-secret=dGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQtdGVzdC1zZWNyZXQ="
})
class RunaryApplicationTests {

    @Test
    void contextLoads() {
    }
}
