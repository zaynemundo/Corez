import sys
import os
import json
import subprocess
import re

def log(msg):
    sys.stderr.write(f"[GitSuperpowers] {msg}\n")
    sys.stderr.flush()

def run_cmd(cmd, cwd=None):
    log(f"Running: {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if res.returncode != 0:
        log(f"Command failed with exit status {res.returncode}")
        log(f"Stdout: {res.stdout}")
        log(f"Stderr: {res.stderr}")
    return res

def main():
    # 1. Parse input context from stdin
    cwd = "/workspaces/New-Corez"
    transcript_path = None
    
    try:
        if not sys.stdin.isatty():
            input_data = sys.stdin.read().strip()
            if input_data:
                context = json.loads(input_data)
                log(f"Received context: {context}")
                cwd = context.get("cwd", cwd)
                transcript_path = context.get("transcript_path")
    except Exception as e:
        log(f"Error parsing stdin: {e}")

    # 2. Ensure Git identity is set for the local repo if not already set globally/locally
    res_name = run_cmd(["git", "config", "user.name"], cwd=cwd)
    if not res_name.stdout.strip():
        run_cmd(["git", "config", "user.name", "Antigravity Agent"], cwd=cwd)
    res_email = run_cmd(["git", "config", "user.email"], cwd=cwd)
    if not res_email.stdout.strip():
        run_cmd(["git", "config", "user.email", "antigravity-agent@google.com"], cwd=cwd)

    # 3. Get git changes
    res_status = run_cmd(["git", "status", "--porcelain"], cwd=cwd)
    changes = res_status.stdout.strip()
    
    if not changes:
        log("No changes to commit.")
        print(json.dumps({
            "decision": "stop",
            "reason": "No changes to commit."
        }))
        return

    log(f"Changes detected:\n{changes}")

    # 4. Formulate commit message from transcript
    commit_summary = "implement task changes"
    commit_description = ""
    
    if transcript_path and os.path.exists(transcript_path):
        log(f"Parsing transcript at: {transcript_path}")
        try:
            user_inputs = []
            with open(transcript_path, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    step = json.loads(line)
                    if step.get("type") == "USER_INPUT" or step.get("source") == "USER_EXPLICIT":
                        content = step.get("content", "")
                        if content:
                            user_inputs.append(content)
            
            if user_inputs:
                last_input = user_inputs[-1].strip()
                # Clean up the input (first line or truncated version of the prompt)
                first_line = last_input.split("\n")[0].strip()
                # Remove XML/HTML tags
                first_line = re.sub(r'<[^>]+>', '', first_line).strip()
                if len(first_line) > 60:
                    commit_summary = first_line[:57] + "..."
                else:
                    commit_summary = first_line
                commit_description = last_input
        except Exception as e:
            log(f"Error reading transcript: {e}")

    # If we couldn't get a summary from the transcript, construct one from changed files
    if commit_summary == "implement task changes":
        changed_files = []
        for line in changes.split("\n"):
            parts = line.strip().split(None, 1)
            if len(parts) == 2:
                changed_files.append(os.path.basename(parts[1]))
        if changed_files:
            files_str = ", ".join(changed_files[:3])
            if len(changed_files) > 3:
                files_str += f" and {len(changed_files) - 3} others"
            commit_summary = f"update {files_str}"

    # 5. Perform Git actions
    # Check current branch
    res_branch = run_cmd(["git", "branch", "--show-current"], cwd=cwd)
    current_branch = res_branch.stdout.strip()
    if not current_branch:
        current_branch = "main"

    log(f"Current branch is {current_branch}")

    # Step 5a: Add changes
    res_add = run_cmd(["git", "add", "-A"], cwd=cwd)
    if res_add.returncode != 0:
        print(json.dumps({
            "decision": "stop",
            "reason": f"Failed to stage changes: {res_add.stderr}"
        }))
        return

    # Step 5b: Commit changes
    commit_msg = f"Auto-commit: {commit_summary}"
    commit_cmd = ["git", "commit", "-m", commit_msg]
    if commit_description:
        commit_cmd.extend(["-m", f"Goal/Prompt:\n{commit_description}"])
        
    res_commit = run_cmd(commit_cmd, cwd=cwd)
    if res_commit.returncode != 0:
        print(json.dumps({
            "decision": "stop",
            "reason": f"Failed to commit changes: {res_commit.stderr}"
        }))
        return

    # Step 5c: Fetch remote changes
    res_fetch = run_cmd(["git", "fetch", "origin", "main"], cwd=cwd)
    if res_fetch.returncode != 0:
        log("Fetch failed. Trying to push directly.")
    else:
        # Step 5d: Rebase to avoid merge commits
        res_rebase = run_cmd(["git", "rebase", "origin/main"], cwd=cwd)
        if res_rebase.returncode != 0:
            log("Rebase failed, aborting rebase.")
            run_cmd(["git", "rebase", "--abort"], cwd=cwd)
            print(json.dumps({
                "decision": "stop",
                "reason": "Rebase conflict occurred with origin/main. Please resolve manually."
            }))
            return

    # Step 5e: Push changes
    res_push = run_cmd(["git", "push", "origin", f"{current_branch}:main"], cwd=cwd)
    if res_push.returncode != 0:
        print(json.dumps({
            "decision": "stop",
            "reason": f"Failed to push to origin/main: {res_push.stderr}"
        }))
        return

    log("Committed and pushed successfully to main.")
    print(json.dumps({
        "decision": "stop",
        "reason": f"Successfully auto-committed and pushed to main: {commit_msg}"
    }))

if __name__ == "__main__":
    main()
