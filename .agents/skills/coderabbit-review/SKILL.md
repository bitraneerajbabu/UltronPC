---
name: coderabbit-review
description: Perform automated CodeRabbit AI style code review on uncommitted changes, git diffs, or specific pull requests. Focuses on security, CPCB compliance, concurrency, performance, and code quality.
---

# CodeRabbit AI Code Review Skill

Use this skill when the user asks for a "coderabbit review", "review like coderabbit", or requests an automated CodeRabbit-style code audit.

## Review Methodology

1. **High-Level Summary**:
   - Provide a 2-3 sentence executive summary of the changes and their overall impact on the UltrON platform.
   - List key features, bug fixes, or refactorings included in the diff.

2. **Critical Findings & Security**:
   - Classify findings into:
     - 🚨 **CRITICAL**: Bugs causing data loss, security vulnerabilities, or app crashes.
     - ⚠️ **HIGH**: CPCB compliance violations, SQLite write lock contentions, or type coercion errors.
     - 💡 **MEDIUM / LOW**: Performance improvements, code clarity, or unused variables.

3. **Domain-Specific Verification Checklist**:
   - **Backend (FastAPI / Python)**:
     - CPCB Quality Codes (`U`, `O`, `E`, `N`) respected.
     - SQLite concurrency (semaphores, backoff jitter).
     - Parameterized SQL queries & secure path handling.
   - **Frontend (React 18 / TypeScript)**:
     - Numeric input validation (`Number()` conversion before payload save).
     - LCP zero-delay immediate rendering.
     - Optimistic UI rollback state integrity.

4. **Actionable Suggestions**:
   - Provide exact diff blocks (` ```diff `) showing recommended code improvements.
