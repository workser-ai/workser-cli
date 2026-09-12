---
topic: agent-cloud-workspace
title: Agent Cloud workspace and files
summary: Understand and verify the private E2B workspace every cloud agent receives by default.
commands: [agent-cloud]
---

# Agent Cloud workspace and files

Workspace and file tools are part of the Agent Cloud baseline. A newly created
agent can read, write and list files, and run validation commands in its private
E2B workspace without an external tool binding or hidden capability flag. The
workspace starts lazily on the first file or command operation, so a run that
only answers a question does not start or bill a sandbox.

Do not report “no tools” merely because `get <id> tool` returns an empty list.
That command lists connected external actions; `read_file`, `write_file`,
`list_files` and `run_command` are built into the runtime and appear in the
run's tool steps. When file work is required, ask the agent to create, read back
and validate a small file before declaring the setup ready.

The repo and Dockerfile managed by `workspace` define the agent's machine image.
The folder on this computer is only that configuration checkout; it is not the
temporary `/home/user/work` directory used inside an E2B run. An empty or
unpushed local checkout therefore does not prove that the cloud agent lacks a
runtime workspace.
