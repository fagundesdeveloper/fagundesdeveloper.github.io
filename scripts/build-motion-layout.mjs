import fs from "node:fs/promises";
import path from "node:path";

const sourcePath = "/Users/fagundes/Desktop/vagas.excalidraw";
const projectRoot = path.resolve(import.meta.dirname, "..");
const outputPath = path.join(projectRoot, "assets", "motion-layout.js");

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const active = source.elements.filter((element) => !element.isDeleted);

const scenarios = [
  active.filter((element) => element.x < 4000),
  active.filter((element) => element.x >= 4000 && element.x < 8000),
  active.filter((element) => element.x >= 8000),
];

const frameMinX = scenarios.map((elements) => Math.min(...elements.map((element) => element.x)));
const frameMinY = Math.min(...active.map((element) => element.y));
const frameWidth = Math.max(...scenarios[0].map((element) => element.x + element.width)) - frameMinX[0];
const frameHeight = Math.max(...scenarios[0].map((element) => element.y + element.height)) - frameMinY;

const roleByColor = {
  "#b2f2bb": "car",
  "#a5d8ff": "motorcycle",
  "#ffec99": "circulation",
  "#1e1e1e": "column",
  "#e9ecef": "structure",
  "#ffffff": "core",
  "#ef9898": "attention",
  transparent: "label",
};

function signature(element) {
  return [
    element.type,
    element.backgroundColor,
    element.strokeColor,
    element.type === "text" ? element.text : "",
  ].join("|");
}

function spatialMatches(left, right, leftScenarioIndex, rightScenarioIndex) {
  const candidates = [];

  left.forEach((leftElement, leftIndex) => {
    right.forEach((rightElement, rightIndex) => {
      if (signature(leftElement) !== signature(rightElement)) return;

      const leftCenterX = leftElement.x - frameMinX[leftScenarioIndex] + leftElement.width / 2;
      const leftCenterY = leftElement.y - frameMinY + leftElement.height / 2;
      const rightCenterX = rightElement.x - frameMinX[rightScenarioIndex] + rightElement.width / 2;
      const rightCenterY = rightElement.y - frameMinY + rightElement.height / 2;
      const distance = Math.hypot(leftCenterX - rightCenterX, leftCenterY - rightCenterY);
      const sizeDifference = Math.abs(leftElement.width - rightElement.width)
        + Math.abs(leftElement.height - rightElement.height);
      const angleDifference = Math.abs((leftElement.angle || 0) - (rightElement.angle || 0));

      candidates.push({
        leftIndex,
        rightIndex,
        cost: distance + sizeDifference * 0.2 + angleDifference * 220,
      });
    });
  });

  candidates.sort((left, right) => left.cost - right.cost);
  const matchedLeft = new Set();
  const matchedRight = new Set();
  const matches = [];

  for (const candidate of candidates) {
    if (matchedLeft.has(candidate.leftIndex) || matchedRight.has(candidate.rightIndex)) continue;
    matchedLeft.add(candidate.leftIndex);
    matchedRight.add(candidate.rightIndex);
    matches.push([candidate.leftIndex, candidate.rightIndex]);
  }

  return matches;
}

function stateFor(element, scenarioIndex) {
  return {
    x: element.x - frameMinX[scenarioIndex],
    y: element.y - frameMinY,
    width: element.width,
    height: element.height,
    angle: element.angle || 0,
    opacity: element.opacity == null ? 1 : element.opacity / 100,
  };
}

function hiddenState(sourceState, { collapse = 0.22 } = {}) {
  return {
    ...sourceState,
    width: Math.max(1, sourceState.width * collapse),
    height: Math.max(1, sourceState.height * collapse),
    opacity: 0,
  };
}

function trackFor(element, id, states) {
  const role = roleByColor[element.backgroundColor] || "outline";
  return {
    id,
    kind: element.type,
    role,
    text: element.type === "text" ? element.text : "",
    fontSize: element.type === "text" ? element.fontSize : null,
    states,
  };
}

const current = scenarios[0];
const proposalOne = scenarios[1];
const proposalTwo = scenarios[2];
const proposalOneMatches = spatialMatches(current, proposalOne, 0, 1);
const currentToProposalOne = new Map(proposalOneMatches);
const matchedProposalOne = new Set(proposalOneMatches.map(([, index]) => index));

const unmatchedProposalOneIndexes = proposalOne
  .map((element, index) => ({ element, index }))
  .filter(({ index }) => !matchedProposalOne.has(index));

const tracks = current.map((element, index) => {
  const currentState = stateFor(element, 0);
  const proposalOneElement = proposalOne[currentToProposalOne.get(index)];
  const proposalTwoElement = proposalTwo[index];
  return trackFor(element, `base-${String(index).padStart(3, "0")}`, [
    currentState,
    stateFor(proposalOneElement, 1),
    stateFor(proposalTwoElement, 2),
  ]);
});

const proposalOneExtraMotorcycles = unmatchedProposalOneIndexes
  .filter(({ element }) => element.backgroundColor === "#a5d8ff")
  .sort((left, right) => left.element.x - right.element.x);
const proposalTwoExtraMotorcycles = proposalTwo
  .map((element, index) => ({ element, index }))
  .slice(current.length)
  .filter(({ element }) => element.backgroundColor === "#a5d8ff")
  .sort((left, right) => left.element.x - right.element.x);
const currentMotorcycleSources = current.filter((element) => element.backgroundColor === "#a5d8ff");

proposalOneExtraMotorcycles.forEach(({ element }, index) => {
  const source = currentMotorcycleSources[index % currentMotorcycleSources.length];
  const currentSourceState = stateFor(source, 0);
  tracks.push(trackFor(element, `moving-motorcycle-${String(index).padStart(2, "0")}`, [
    hiddenState(currentSourceState),
    stateFor(element, 1),
    stateFor(proposalTwoExtraMotorcycles[index].element, 2),
  ]));
});

unmatchedProposalOneIndexes
  .filter(({ index }) => !matchedProposalOne.has(index))
  .filter(({ element }) => element.backgroundColor !== "#a5d8ff")
  .forEach(({ element }, index) => {
    const visible = stateFor(element, 1);
    tracks.push(trackFor(element, `proposal-one-note-${String(index).padStart(2, "0")}`, [
      hiddenState(visible, { collapse: element.type === "text" ? 0.85 : 0.05 }),
      visible,
      hiddenState(visible, { collapse: element.type === "text" ? 0.85 : 0.05 }),
    ]));
  });

const counts = scenarios.map((elements) => ({
  cars: elements.filter((element) => element.backgroundColor === "#b2f2bb").length,
  motorcycles: elements.filter((element) => element.backgroundColor === "#a5d8ff").length,
}));

const output = {
  width: frameWidth,
  height: frameHeight,
  tracks,
  counts,
};

await fs.writeFile(
  outputPath,
  `window.PLAN_LAYOUT = ${JSON.stringify(output)};\n`,
  "utf8",
);

console.log(JSON.stringify({
  outputPath,
  width: frameWidth,
  height: frameHeight,
  tracks: tracks.length,
  counts,
}, null, 2));
