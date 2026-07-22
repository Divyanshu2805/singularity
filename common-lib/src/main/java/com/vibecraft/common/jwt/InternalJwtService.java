package com.vibecraft.common.jwt;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * Issues and verifies a short-lived internal JWT that can carry caller identity between vibecraft services
 * (HMAC-signed). <b>No live request path uses it today</b>: gateway-service issues nothing, and calls between
 * services authenticate with the shared secret ({@link InternalServiceAuthFilter}), not with a token. It is kept
 * as the plumbing a gateway-issued identity would need; {@code FeignClientInterceptor} still forwards a Bearer
 * token if one happens to be on the current request.
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
