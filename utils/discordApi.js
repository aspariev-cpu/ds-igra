function findMemberByStatic(members, targetStatic) {
  const staticLower = targetStatic.toString().toLowerCase();
  
  for (const [id, member] of members) {
    const nick = (member.nickname || member.user.username).toLowerCase();
    
    // Ищем точное совпадение статика как отдельное число
    const staticRegex = new RegExp(`\\b${staticLower}\\b`);
    if (staticRegex.test(nick)) {
      return {
        found: true,
        member: member
      };
    }
  }
  
  return {
    found: false,
    member: null
  };
}

module.exports = { findMemberByStatic };