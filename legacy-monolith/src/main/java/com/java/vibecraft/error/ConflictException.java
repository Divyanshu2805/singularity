package com.java.vibecraft.error;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;

/** The request is valid but clashes with something already in progress - a 409. */
@Getter
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class ConflictException extends RuntimeException {
    String message;
}
