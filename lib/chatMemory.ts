let lastTopic: string | null = null;

export function rememberTopic(topic: string) {
  if (topic !== "any") lastTopic = topic;
}

export function getLastTopic() {
  return lastTopic;
}