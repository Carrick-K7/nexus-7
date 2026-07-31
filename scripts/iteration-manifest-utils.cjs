function mergeGitEntries(currentEntries, fallbackEntries) {
  const seenIds = new Set();
  return [...currentEntries, ...fallbackEntries].filter(entry => {
    if (seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  });
}

module.exports = { mergeGitEntries };
