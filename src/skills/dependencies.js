/**
 * CoreZ Skill Dependency Expansion & Topological Sorting
 * Solves dependency graphs and prevents cycles.
 */

export function expandDependencies(skillIds, registry) {
  const visited = new Set();
  const visiting = new Set();
  const orderedSkillIds = [];

  function visit(id) {
    if (visiting.has(id)) {
      throw new Error(
        `Circular dependency detected in skill resolution: ${id}`,
      );
    }
    if (!visited.has(id)) {
      visiting.add(id);
      const skill = registry.getSkill(id);
      if (skill && Array.isArray(skill.dependencies)) {
        for (const depId of skill.dependencies) {
          if (!registry.getSkill(depId)) {
            console.warn(
              `Skill "${id}" depends on "${depId}" which is not registered.`,
            );
            continue;
          }
          visit(depId);
        }
      }
      visiting.delete(id);
      visited.add(id);
      orderedSkillIds.push(id);
    }
  }

  for (const id of skillIds) {
    if (registry.getSkill(id)) {
      visit(id);
    }
  }

  return orderedSkillIds.map((id) => registry.getSkill(id)).filter(Boolean);
}
