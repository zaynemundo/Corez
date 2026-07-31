---
description: Repeats the last task/request in a loop until it completes successfully or reaches 5 attempts.
---

You are in a **retry loop**. Re-execute the user's most recent substantive request (the one before `/loop`). You have up to **5 total attempts**. 

Rules:
- Attempt 1 of up to 5. Run the previous task again.
- If the task completes successfully (exit code 0, no errors), stop and report success.
- If the task fails, retry from scratch (attempt N+1). Do not reuse partial output.
- If all 5 attempts fail, stop and report: "Loop exhausted after 5 attempts — task did not complete."
