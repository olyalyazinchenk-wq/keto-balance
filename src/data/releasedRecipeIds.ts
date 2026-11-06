/**
 * Released recipe IDs manifest.
 * Option 1B: 20 verified keto recipes for initial 7-day launch.
 * Approved by Olga (2026-11-07, Variant 1B).
 * Remaining recipes retained in PREVIEW_RECIPE_IDS and drafts.
 */

export interface RecipeApprovalRecord {
  id: string;
  sourceHash: string;
  approvalRef: string;
  approvalDate: string;
  serv: number;
  imageStatus: 'verified' | 'unverified' | 'placeholder';
  license: string;
}

export const RELEASED_RECIPE_IDS: readonly string[] = [
  "k1",
  "k2",
  "k3",
  "k4",
  "k5",
  "k6",
  "k7",
  "k8",
  "k9",
  "k10",
  "k11",
  "k12",
  "k13",
  "k14",
  "k15",
  "k16",
  "k17",
  "k25",
  "k27",
  "k28"
];

export const RELEASED_RECIPE_APPROVALS: readonly RecipeApprovalRecord[] = [
  {
    "id": "k1",
    "sourceHash": "aac462ef517be647c53511dbdc255422500908abaa45d8982c39053c02a589d2",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "verified",
    "license": "proprietary"
  },
  {
    "id": "k2",
    "sourceHash": "d0d5980961fc14099f03e58ab5db482527968654950db58a899eab63f2bdf404",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 1,
    "imageStatus": "verified",
    "license": "proprietary"
  },
  {
    "id": "k3",
    "sourceHash": "727e4ac54da51e0b340f4c73a0a46cea23c6aca06d1e2d5aaed87fb0268a642b",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "verified",
    "license": "proprietary"
  },
  {
    "id": "k4",
    "sourceHash": "b82bea0d01ab897107a93d956fbb4beccedb99741d712c854a5b3882a1f4d800",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "verified",
    "license": "proprietary"
  },
  {
    "id": "k5",
    "sourceHash": "dbe10d0dd142558c87bddb7d12e81c42c949825d4147c978b745a693202e997f",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "verified",
    "license": "proprietary"
  },
  {
    "id": "k6",
    "sourceHash": "76b81068be38f05807b814c62a5ddf0c390d731d0f930e810a82a871198ed3cf",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k7",
    "sourceHash": "1652e4afa51355fd099181b78aff1562682630040069657878388c6197ee7c6b",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k8",
    "sourceHash": "1e91a9a4fa3eed6d1cb3c2529f12e180d241261607c484a2de4454401e358f3c",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k9",
    "sourceHash": "db0a5be45289d81dd7a36b6548b3ff6645071bb6dd9483e6e59bc4875efceeed",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k10",
    "sourceHash": "8c17e94668962a033c827149ec6af865e56a5cf694ea8804861cb8ee6e736195",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k11",
    "sourceHash": "543cdac7e127370897c56c63fde211a562e7364d05b6c31ede9819f20d15bb29",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k12",
    "sourceHash": "db33eb269f32ccb9f6ecd1867735a22421aad5f1115fd9f1441e0dcf2f586418",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k13",
    "sourceHash": "ed10a03a9fe34657d019acdb12bfb45d1c7f827612f9d4e898b0a70e191bce23",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k14",
    "sourceHash": "422bf829937ea54ae65543633c439a54317d411c73572a3bbbb7489e8a2571d7",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k15",
    "sourceHash": "94b2af20d72100d70cf0e3892d38cdf9ca21e06149923576dd4efe05e0c05fde",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k16",
    "sourceHash": "d774928ffc1a46f2bf793073e7ab6e645cd916eea53954a90ad352e231acf05a",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k17",
    "sourceHash": "c97612a3e52c68fa9a42b88e2d69e661138bb1fcfe58c929e5871e69ee8f09ed",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k25",
    "sourceHash": "63298ec80c8350145c08593d08964bd246cc98ed81f4c5c3f9925da54d75ee6d",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k27",
    "sourceHash": "2c20a5aaf05e2370cf085b27d0227dfd45938f5469b87be70a1f3ef7db400110",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary"
  },
  {
    "id": "k28",
    "sourceHash": "d541360b4d7b421c1886118bcab822275e503b9eb68212bbbe7d93072bd0bac4",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary"
  }
];

export const PREVIEW_RECIPE_IDS: readonly string[] = [
  'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10',
  'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19', 'k20',
  'k21', 'k22', 'k23', 'k24', 'k25', 'k26', 'k27', 'k28', 'k29', 'k30',
  'k31', 'k32', 'k33', 'k34',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16',
];
