---
name: backend-architecture
description: Specialized skill for back-end architecture with a strict hierarchy of 1. Security, 2. Functionality.
---

# Back-End Architecture & Design Hierarchy Skill

Use this skill whenever designing, building, or reviewing back-end APIs, serverless functions, proxies, and cloud worker endpoints.

## Design Hierarchy

### Level 1: Security (Highest Priority)
- **Input Validation & Sanitization**: Validate all request parameters, headers, and body JSON schemas before processing.
- **Secret & Credential Safety**: Never expose API keys, bearer tokens, or internal environment secrets to public clients or error messages. Use `safeErrorDetail` sanitization.
- **Authentication & Rate Limiting**: Ensure authorized API access and enforce request rate limits to prevent abuse.
- **CORS & Data Isolation**: Enforce strict CORS policies and prevent cross-tenant data leakages.

### Level 2: Functionality (Core Reliability)
- **Robust API Contracts**: Maintain predictable, standardized JSON request and response payloads.
- **Error Recovery & Fallbacks**: Implement primary-to-secondary model failovers and informative HTTP status codes (200, 400, 405, 502, 503).
- **Stateless & Scalable Design**: Build stateless cloud workers and microservices for low latency and high availability.
