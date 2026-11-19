import { cheb, COLS, ROWS, type Action, type Match, type Skater, type Team } from "./rules";

/**
 * A simple coach for the monster team: shoot when it can, carry toward the
 * net, hit the puck carrier, chase loose pucks. Deliberately readable rather
 * than clever, so kids can learn to predict and beat it.
 */
export function chooseAction(match: Match, team: Team): Action {
  const mine = match.skaters.filter((s) => s.team === team && match.canActivate(s));
  if (mine.length === 0) return { type: "endTurn" };
  const goalX = match.goalX(team);
  const mid = Math.floor(ROWS / 2);
  const carrier = match.carrier;
  const toGoal = (x: number, y: number): number => Math.abs(goalX - x) * 2 + Math.abs(y - mid);

  // 1. We have the puck.
  if (carrier && carrier.team === team && match.canActivate(carrier)) {
    const opts = match.options(carrier.id);
    if (opts.shot && opts.shot.target <= 5) return { type: "shoot", id: carrier.id };
    const safe = opts.moves.filter((m) => !m.deke || m.target <= 3);
    const best = safe.sort((a, b) => toGoal(a.x, a.y) + match.zones(team, a.x, a.y) * 3 - (toGoal(b.x, b.y) + match.zones(team, b.x, b.y) * 3))[0];
    if (best && toGoal(best.x, best.y) < toGoal(carrier.x, carrier.y)) return { type: "move", id: carrier.id, x: best.x, y: best.y };
    if (opts.shot) return { type: "shoot", id: carrier.id };
    const pass = opts.passes.filter((p) => p.target <= 4 && toGoal(p.to.x, p.to.y) < toGoal(carrier.x, carrier.y)).sort((a, b) => a.target - b.target)[0];
    if (pass) return { type: "pass", id: carrier.id, to: pass.to.id };
    return { type: "rest", id: carrier.id };
  }

  // 2. They have the puck: hit the carrier, or close on them.
  if (carrier && carrier.team !== team) {
    for (const s of mine) {
      const hit = match.options(s.id).hits.find((h) => h.on.id === carrier.id);
      if (hit) return { type: "hit", id: s.id, on: carrier.id };
    }
    const chaser = closest(mine.filter((s) => !s.moved), carrier);
    if (chaser) {
      const move = match
        .options(chaser.id)
        .moves.filter((m) => !m.deke || m.target <= 3)
        .sort((a, b) => cheb(a, carrier) - cheb(b, carrier))[0];
      if (move && cheb(move, carrier) < cheb(chaser, carrier)) return { type: "move", id: chaser.id, x: move.x, y: move.y };
    }
  }

  // 3. Loose puck: go and get it.
  if (!carrier) {
    const chaser = closest(mine.filter((s) => !s.moved), match.puck);
    if (chaser) {
      const move = match.options(chaser.id).moves.sort((a, b) => cheb(a, match.puck) - cheb(b, match.puck))[0];
      if (move && cheb(move, match.puck) < cheb(chaser, match.puck)) return { type: "move", id: chaser.id, x: move.x, y: move.y };
    }
  }

  // 4. A teammate has it but cannot act: get open up ice, or lean on someone.
  for (const s of mine) {
    const opts = match.options(s.id);
    const hit = opts.hits.sort((a, b) => a.target - b.target)[0];
    if (hit && hit.target <= 4) return { type: "hit", id: s.id, on: hit.on.id };
  }
  const spare = mine.find((s) => !s.moved && !s.active);
  if (spare && carrier && carrier.team === team) {
    const move = match
      .options(spare.id)
      .moves.filter((m) => !m.deke && match.zones(team, m.x, m.y) === 0 && m.x > 0 && m.x < COLS - 1)
      .sort((a, b) => toGoal(a.x, a.y) - toGoal(b.x, b.y))[0];
    if (move) return { type: "move", id: spare.id, x: move.x, y: move.y };
  }
  // Anyone part-way through an activation must be closed out so the turn can end.
  const open = mine.find((s) => s.active);
  if (open) return { type: "rest", id: open.id };
  return { type: "endTurn" };
}

function closest(list: Skater[], to: { x: number; y: number }): Skater | undefined {
  return [...list].sort((a, b) => cheb(a, to) - cheb(b, to))[0];
}
