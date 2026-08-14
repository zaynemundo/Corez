// CompactionEngine: Proactive context window management and compaction.
// Inspired by DeepSeek Harness dsh-compaction, it condenses earlier conversation turns
// under token pressure while preserving KV-cache friendly prefixes and recent turn context.

export class CompactionEngine {
  constructor(options = {}) {
    this.thresholdRatio = options.thresholdRatio ?? 0.8; // Compact when usage exceeds 80%
    this.retainTurns = options.retainTurns ?? 2;        // Retain last N turns verbatim
    this.defaultContextLimit = options.defaultContextLimit ?? 64_000;
    this.summarizer = options.summarizer ?? null;       // Optional async function(messagesToCompact)
  }

  /**
   * Fast token estimation (~3.8 characters per token heuristic).
   */
  estimateTokens(messages = []) {
    let totalChars = 0;
    for (const msg of messages) {
      totalChars += (msg.role?.length || 0) + 4;
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part?.text) totalChars += part.text.length;
        }
      }
      if (msg.tool_calls) {
        totalChars += JSON.stringify(msg.tool_calls).length;
      }
    }
    return Math.ceil(totalChars / 3.8);
  }

  /**
   * Checks whether the current messages require compaction.
   */
  isUnderPressure(messages = [], contextLimit = this.defaultContextLimit) {
    const currentTokens = this.estimateTokens(messages);
    const threshold = Math.floor(contextLimit * this.thresholdRatio);
    return {
      underPressure: currentTokens >= threshold,
      currentTokens,
      threshold,
      contextLimit
    };
  }

  /**
   * Generates a structured summary from an array of messages to be compacted.
   */
  generateDeterministicSummary(messagesToCompact = []) {
    const keyActions = [];
    const filesModified = new Set();
    const filesInspected = new Set();
    let initialUserGoal = '';

    for (const msg of messagesToCompact) {
      if (msg.role === 'user' && !initialUserGoal) {
        initialUserGoal = typeof msg.content === 'string' ? msg.content.slice(0, 300) : '';
      }
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        const lines = msg.content.split('\n').filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          keyActions.push(lines[0].slice(0, 150));
        }
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const fn = tc?.function?.name || tc?.name;
          const args = tc?.function?.arguments || tc?.arguments;
          if (['write_file', 'edit_file'].includes(fn)) {
            try {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              if (parsed?.filePath) filesModified.add(parsed.filePath);
            } catch {
              // ignore
            }
          } else if (['read_file'].includes(fn)) {
            try {
              const parsed = typeof args === 'string' ? JSON.parse(args) : args;
              if (parsed?.filePath) filesInspected.add(parsed.filePath);
            } catch {
              // ignore
            }
          }
        }
      }
    }

    let summary = `### Condensed Conversation History\n`;
    if (initialUserGoal) {
      summary += `- **Initial Goal**: ${initialUserGoal}\n`;
    }
    if (filesModified.size > 0) {
      summary += `- **Files Modified**: ${Array.from(filesModified).join(', ')}\n`;
    }
    if (filesInspected.size > 0) {
      summary += `- **Files Inspected**: ${Array.from(filesInspected).join(', ')}\n`;
    }
    if (keyActions.length > 0) {
      summary += `- **Key Progress**:\n  * ${keyActions.slice(0, 5).join('\n  * ')}\n`;
    }
    summary += `- **Note**: Previous turns have been compacted to conserve model context. Continue seamlessly with subsequent steps.`;

    return summary;
  }

  /**
   * Compacts conversation messages if under pressure or if forced.
   * @param {Array} messages - Conversation messages
   * @param {object} options - Options (contextLimit, force, customSummary)
   * @returns {Promise<{ messages: Array, compacted: boolean, originalTokens: number, newTokens: number, summary?: string }>}
   */
  async compact(messages = [], options = {}) {
    const contextLimit = options.contextLimit ?? this.defaultContextLimit;
    const force = options.force === true;
    const pressure = this.isUnderPressure(messages, contextLimit);

    if (!pressure.underPressure && !force) {
      return {
        messages,
        compacted: false,
        originalTokens: pressure.currentTokens,
        newTokens: pressure.currentTokens
      };
    }

    // Identify message partitions:
    // Partition 1: System prompt (index 0 if role === 'system')
    // Partition 2: Older span (to compact)
    // Partition 3: Recent tail (to keep verbatim)
    const hasSystem = messages.length > 0 && messages[0]?.role === 'system';
    const systemPrompt = hasSystem ? messages[0] : null;
    const workingMessages = hasSystem ? messages.slice(1) : [...messages];

    const retainCount = Math.max(2, this.retainTurns * 2); // 2 messages per turn (user + assistant)
    if (workingMessages.length <= retainCount) {
      // Not enough turns to compact
      return {
        messages,
        compacted: false,
        originalTokens: pressure.currentTokens,
        newTokens: pressure.currentTokens
      };
    }

    const splitIndex = workingMessages.length - retainCount;
    const toCompact = workingMessages.slice(0, splitIndex);
    const recentTail = workingMessages.slice(splitIndex);

    let summaryText = options.customSummary;
    if (!summaryText) {
      if (typeof this.summarizer === 'function') {
        try {
          summaryText = await this.summarizer(toCompact);
        } catch {
          summaryText = this.generateDeterministicSummary(toCompact);
        }
      } else {
        summaryText = this.generateDeterministicSummary(toCompact);
      }
    }

    const checkpointMessage = {
      role: 'user',
      content: `This is an automatically generated conversation checkpoint condensing an earlier span of the conversation to free up context.\n\n<compacted-summary>\n${summaryText}\n</compacted-summary>\n\nTreat the captured context as established background and build on it directly.`
    };

    const newMessages = [];
    if (systemPrompt) newMessages.push(systemPrompt);
    newMessages.push(checkpointMessage);
    newMessages.push(...recentTail);

    const newTokens = this.estimateTokens(newMessages);

    return {
      messages: newMessages,
      compacted: true,
      originalTokens: pressure.currentTokens,
      newTokens,
      savedTokens: Math.max(0, pressure.currentTokens - newTokens),
      summary: summaryText
    };
  }
}
