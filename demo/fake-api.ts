import type { CommandItem } from '../src'

/** Fictional people for the simulated "directory" API. */
const PEOPLE = [
  ['Alice Martin', 'Product designer'],
  ['Alan Brooks', 'Backend engineer'],
  ['Alma Ortega', 'Engineering manager'],
  ['Ben Carter', 'Mobile engineer'],
  ['Bianca Rossi', 'QA lead'],
  ['Chloe Nguyen', 'Frontend engineer'],
  ['Daniel Kim', 'DevOps engineer'],
  ['Diana Walsh', 'Data scientist'],
  ['Elena Fischer', 'Product manager'],
  ['Ethan Hughes', 'Solutions architect'],
  ['Fiona Clarke', 'UX researcher'],
  ['George Patel', 'Backend engineer'],
  ['Hannah Lee', 'Customer success'],
  ['Isaac Moreno', 'ML engineer'],
  ['Julia Novak', 'Frontend engineer'],
  ['Kevin Osei', 'Security engineer'],
  ['Laura Bennett', 'Head of design'],
  ['Marco Bianchi', 'Flutter developer'],
  ['Nina Larsen', 'Tech writer'],
  ['Oliver Grant', 'CTO'],
  ['Priya Shah', 'Data engineer'],
  ['Quentin Moss', 'Support engineer'],
  ['Rachel Adams', 'Recruiter'],
  ['Samuel Reed', 'Full-stack engineer'],
  ['Tara Quinn', 'Marketing lead'],
  ['Victor Hale', 'iOS engineer'],
  ['Wendy Park', 'Android engineer'],
  ['Yusuf Demir', 'Platform engineer'],
  ['Zoe Turner', 'Product analyst'],
] as const

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })

/**
 * Simulated network search with random latency (150–650 ms), so responses can arrive out of order.
 * The palette discards stale responses, so the list never flickers back to an older query.
 */
export async function searchPeople(query: string, signal: AbortSignal): Promise<CommandItem[]> {
  await sleep(150 + Math.random() * 500, signal)
  const q = query.toLowerCase()
  return PEOPLE.filter(([name, role]) => `${name} ${role}`.toLowerCase().includes(q))
    .slice(0, 6)
    .map(([name, role]) => ({
      id: `person:${name}`,
      title: name,
      subtitle: role,
      data: { kind: 'person', initials: name.split(' ').map((p) => p[0]).join('') },
    }))
}
