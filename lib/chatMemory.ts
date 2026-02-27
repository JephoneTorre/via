type Session = {
    lastTopic?: string;
  };
  
  const memory = new Map<string, string>();

  export function getTopic(sessionId: string) {
    return memory.get(sessionId);
  }
  
  export function setTopic(sessionId: string, topic: string) {
    memory.set(sessionId, topic);
  }
  
  
  export function getTopic(id: string): string | undefined {
    return getSession(id).lastTopic;
  }