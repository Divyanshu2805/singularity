package com.vibecraft.common.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues and verifies the short-lived internal JWT that carries caller identity between vibecraft
 * services, mirroring {@code AuthUtil}'s legacy-Bearer HMAC scheme in legacy-monolith so the mechanics are
 * already familiar. gateway-service is the only issuer; every other service only ever verifies.
 */
public class InternalJwtService {

    private final InternalJwtProperties properties;

    public InternalJwtService(InternalJwtProperties properties) {
        this.properties = properties;
    }

    private SecretKey secretKey() {
        return Keys.hmacShaKeyFor(properties.secretKey().getBytes(StandardCharsets.UTF_8));
    }

    public String issue(Long userId, String username) {
        Date now = new Date();
        return Jwts.builder()
                .subject(username)
                .claim("userId", userId.toString())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + properties.expiration().toMillis()))
                .signWith(secretKey())
                .compact();
    }

    /** @throws JwtException if the token is missing, expired, or fails signature verification */
    public InternalJwtClaims verify(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(secretKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return new InternalJwtClaims(Long.parseLong(claims.get("userId", String.class)), claims.getSubject());
    }
}
