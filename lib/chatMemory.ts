type Session = {
    lastTopic?: string;
  };
  
  const sessions = new Map<string, Session>();
  
  export function getSession(id: string): Session {
    if (!sessions.has(id)) sessions.set(id, {});
    return sessions.get(id)!;
  }
  
  export function setTopic(id: string, topic: string) {
    const session = getSession(id);
    session.lastTopic = topic;
  }
  
  export function getTopic(id: string): string | undefined {
    return getSession(id).lastTopic;
  }