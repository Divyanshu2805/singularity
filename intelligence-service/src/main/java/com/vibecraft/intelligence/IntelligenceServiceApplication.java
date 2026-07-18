package com.vibecraft.intelligence;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication
@EnableFeignClients
public class IntelligenceServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(IntelligenceServiceApplication.class, args);
    }
}
