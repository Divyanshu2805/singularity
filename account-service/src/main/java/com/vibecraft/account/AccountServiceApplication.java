package com.vibecraft.account;

import com.vibecraft.common.util.WindowsTimezoneWorkaround;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class AccountServiceApplication {

    public static void main(String[] args) {
        WindowsTimezoneWorkaround.apply();
        SpringApplication.run(AccountServiceApplication.class, args);
    }
}
