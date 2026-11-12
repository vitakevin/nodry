// Integrated growth rates: equal score increases reveal more geometry in higher bands.
// This changes only the visual effect, never the hydration score or reminder timer.
export function crackGrowth(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const s = Math.max(0, Math.min(100, score));
  return (Math.min(s, 20) + Math.max(0, Math.min(s - 20, 30)) * 2
    + Math.max(0, Math.min(s - 50, 30)) * 3 + Math.max(0, s - 80) * 4) / 250;
}

type Point = readonly [number, number];
interface Branch { points: readonly Point[]; children?: readonly { at: number; branch: Branch }[] }
export interface CrackPath { d: string; start: number; length: number; points: readonly Point[] }

// One fixed connected tree. Every branch starts at a real point on its parent;
// its arrival distance includes the parent's length up to that point.
const tree: Branch = {
  points: [[999,699],[982,684],[968,660],[939,648],[924,618],[891,607],[872,574],[835,559],[812,523],[776,510],[754,475],[715,457],[692,418],[653,400],[629,362],[588,346],[561,303],[520,286],[492,246],[448,229],[419,186],[374,166],[341,125],[291,110],[256,65]],
  children: [
    { at: 2, branch: { points: [[968,660],[937,672],[916,659],[883,669],[859,650],[821,658],[794,636],[752,641],[717,615],[669,619],[633,592],[584,590],[540,561],[490,558],[443,528],[390,523],[339,489],[283,482],[227,443],[167,432]], children: [
      { at: 4, branch: { points: [[859,650],[841,626],[813,616],[802,585],[776,574]] } },
      { at: 8, branch: { points: [[717,615],[695,648],[657,658],[639,684],[601,697]] } },
      { at: 12, branch: { points: [[540,561],[521,528],[485,515],[471,481],[435,465]] } },
      { at: 16, branch: { points: [[339,489],[317,516],[282,523],[265,551],[227,560]] } },
    ] } },
    { at: 4, branch: { points: [[924,618],[936,586],[920,560],[930,527],[914,499],[924,460],[904,429],[913,387],[891,354],[901,309],[876,270],[884,222],[856,183],[860,134],[831,90],[828,37],[804,1]], children: [
      { at: 3, branch: { points: [[930,527],[962,513],[972,481],[999,467]] } },
      { at: 6, branch: { points: [[904,429],[872,411],[862,379],[829,363],[813,328]] } },
      { at: 10, branch: { points: [[876,270],[908,250],[916,217],[949,195],[962,160],[993,140]] } },
      { at: 13, branch: { points: [[860,134],[827,119],[815,85],[779,69],[766,32]] } },
    ] } },
    { at: 7, branch: { points: [[835,559],[841,522],[821,496],[829,460],[807,432],[812,393],[785,364],[790,323],[761,294],[764,251],[735,220],[735,176],[701,146],[696,100],[658,70],[647,23]], children: [
      { at: 5, branch: { points: [[812,393],[846,372],[853,339],[884,318]] } },
      { at: 10, branch: { points: [[735,220],[702,210],[682,178],[645,168],[625,135]] } },
    ] } },
    { at: 11, branch: { points: [[715,457],[680,468],[655,450],[617,460],[587,438],[546,446],[514,421],[471,424],[436,396],[391,394],[354,362],[307,355],[267,319],[218,309],[173,271],[122,254],[73,217]], children: [
      { at: 4, branch: { points: [[587,438],[568,473],[531,487],[516,521]] } },
      { at: 9, branch: { points: [[391,394],[382,356],[350,338],[340,298],[306,277]] } },
      { at: 13, branch: { points: [[218,309],[195,340],[159,348],[139,381],[101,389]] } },
    ] } },
    { at: 16, branch: { points: [[561,303],[567,266],[543,239],[546,198],[515,169],[512,127],[477,97],[468,52],[431,22],[427,1]], children: [
      { at: 4, branch: { points: [[515,169],[547,148],[554,112],[586,90],[591,53]] } },
    ] } },
    { at: 20, branch: { points: [[419,186],[383,200],[355,181],[316,190],[285,168],[243,173],[209,147],[165,146],[128,116],[81,111],[42,78],[1,65]] } },
  ],
};

function flatten(branch: Branch, start: number): CrackPath[] {
  const distances = [0];
  for (let i = 1; i < branch.points.length; i++) {
    distances.push(distances[i - 1] + Math.hypot(branch.points[i][0] - branch.points[i-1][0], branch.points[i][1] - branch.points[i-1][1]));
  }
  const d = branch.points.map(([x,y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return [{ d, start, length: distances.at(-1)!, points: branch.points }, ...(branch.children ?? []).flatMap(child => flatten(child.branch, start + distances[child.at]))];
}
export const crackPaths = flatten(tree, 0);
export const maxCrackDistance = Math.max(...crackPaths.map(p => p.start + p.length));
export function pathReveal(path: CrackPath, growth: number): number {
  return Math.max(0, Math.min(1, (growth * maxCrackDistance - path.start) / path.length));
}

// Draw the actual prefix instead of normalized SVG dashes: WebKit combines
// pathLength, dash offsets and non-scaling strokes differently on Retina screens.
export function visibleCrackPath(path: CrackPath, growth: number): string {
  let remaining = Math.max(0, growth * maxCrackDistance - path.start);
  if (remaining <= 0) return '';
  if (remaining >= path.length) return path.d;
  let d = `M${path.points[0][0]} ${path.points[0][1]}`;
  for (let i = 1; i < path.points.length; i++) {
    const [x,y] = path.points[i-1], [endX,endY] = path.points[i];
    const length = Math.hypot(endX-x,endY-y);
    if (remaining < length) {
      const t = remaining/length;
      return `${d} L${x+(endX-x)*t} ${y+(endY-y)*t}`;
    }
    d += ` L${endX} ${endY}`;
    remaining -= length;
  }
  return d;
}
