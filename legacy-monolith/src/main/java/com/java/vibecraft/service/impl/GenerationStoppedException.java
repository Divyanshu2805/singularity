package com.java.vibecraft.service.impl;

/** Ends every viewer's stream when the user stops a generation - so another open tab stops too, rather than hanging. */
public class GenerationStoppedException extends RuntimeException {

    public GenerationStoppedException() {
        super("This response was stopped.");
    }
}
