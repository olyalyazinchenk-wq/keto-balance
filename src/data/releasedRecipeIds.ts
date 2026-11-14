/**
 * Released recipe IDs manifest & Candidate Review Records.
 *
 * 1. RELEASED_RECIPE_IDS: 20 verified keto recipes for general release.
 * 2. OWNER_REVIEW_CARNIVORE_IDS: 16 candidate carnivore recipes prepared for owner review.
 * 3. OWNER_ACCEPTANCE_RECIPE_IDS: Combined 36 recipes for owner private acceptance.
 * 4. PREVIEW_RECIPE_IDS: Complete 50-recipe catalog for previews and testing.
 */

export interface RecipeApprovalRecord {
  id: string;
  sourceHash: string;
  approvalRef: string;
  approvalDate: string;
  serv: number;
  imageStatus: 'verified' | 'unverified' | 'placeholder';
  license: string;
  editorialStatus?: 'approved' | 'review' | 'candidate';
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

export const OWNER_REVIEW_CARNIVORE_IDS: readonly string[] = [
  "c1",
  "c2",
  "c3",
  "c4",
  "c5",
  "c6",
  "c7",
  "c8",
  "c9",
  "c10",
  "c11",
  "c12",
  "c13",
  "c14",
  "c15",
  "c16"
];

export const OWNER_ACCEPTANCE_RECIPE_IDS: readonly string[] = [
  ...RELEASED_RECIPE_IDS,
  ...OWNER_REVIEW_CARNIVORE_IDS,
];

export const RELEASED_RECIPE_APPROVALS: readonly RecipeApprovalRecord[] = [
  {
    "id": "k1",
    "sourceHash": "aac462ef517be647c53511dbdc255422500908abaa45d8982c39053c02a589d2",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "verified",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k2",
    "sourceHash": "d0d5980961fc14099f03e58ab5db482527968654950db58a899eab63f2bdf404",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 1,
    "imageStatus": "verified",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k3",
    "sourceHash": "727e4ac54da51e0b340f4c73a0a46cea23c6aca06d1e2d5aaed87fb0268a642b",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "verified",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k4",
    "sourceHash": "b82bea0d01ab897107a93d956fbb4beccedb99741d712c854a5b3882a1f4d800",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "verified",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k5",
    "sourceHash": "dbe10d0dd142558c87bddb7d12e81c42c949825d4147c978b745a693202e997f",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "verified",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k6",
    "sourceHash": "76b81068be38f05807b814c62a5ddf0c390d731d0f930e810a82a871198ed3cf",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k7",
    "sourceHash": "1652e4afa51355fd099181b78aff1562682630040069657878388c6197ee7c6b",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k8",
    "sourceHash": "1e91a9a4fa3eed6d1cb3c2529f12e180d241261607c484a2de4454401e358f3c",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k9",
    "sourceHash": "db0a5be45289d81dd7a36b6548b3ff6645071bb6dd9483e6e59bc4875efceeed",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k10",
    "sourceHash": "8c17e94668962a033c827149ec6af865e56a5cf694ea8804861cb8ee6e736195",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k11",
    "sourceHash": "543cdac7e127370897c56c63fde211a562e7364d05b6c31ede9819f20d15bb29",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k12",
    "sourceHash": "db33eb269f32ccb9f6ecd1867735a22421aad5f1115fd9f1441e0dcf2f586418",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k13",
    "sourceHash": "ed10a03a9fe34657d019acdb12bfb45d1c7f827612f9d4e898b0a70e191bce23",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k14",
    "sourceHash": "422bf829937ea54ae65543633c439a54317d411c73572a3bbbb7489e8a2571d7",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k15",
    "sourceHash": "94b2af20d72100d70cf0e3892d38cdf9ca21e06149923576dd4efe05e0c05fde",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k16",
    "sourceHash": "d774928ffc1a46f2bf793073e7ab6e645cd916eea53954a90ad352e231acf05a",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k17",
    "sourceHash": "c97612a3e52c68fa9a42b88e2d69e661138bb1fcfe58c929e5871e69ee8f09ed",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k25",
    "sourceHash": "63298ec80c8350145c08593d08964bd246cc98ed81f4c5c3f9925da54d75ee6d",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k27",
    "sourceHash": "2c20a5aaf05e2370cf085b27d0227dfd45938f5469b87be70a1f3ef7db400110",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "k28",
    "sourceHash": "d541360b4d7b421c1886118bcab822275e503b9eb68212bbbe7d93072bd0bac4",
    "approvalRef": "decision-variant-1b-olga-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "approved"
  },
  {
    "id": "c1",
    "sourceHash": "9d5d0d991f6783d0f4a494d3cd0e59e801bf5e8677eaf35fdeb3b8596c2db62d",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 1,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c2",
    "sourceHash": "141fe2273077d910fb3da6bf9080bfc5ab0b4bbaeb1a83a9043e324597c802d3",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c3",
    "sourceHash": "41c54de257cccd41da4db499f9eb4cc35fadbd4c5b119ab9041caf1e78f1eaf0",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 4,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c4",
    "sourceHash": "4f9cc2c634df6c3a4db5e52f701de0fd963c77822aadf9fe5920f800dcd4077d",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c5",
    "sourceHash": "81f805028fb43d43e12c9ee9d338239215e706680fcb38e9979ee9a976104912",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c6",
    "sourceHash": "11582cb19a2caf42f4badaf0582e34c773cad3836e4b2b2d543a50744241d502",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c7",
    "sourceHash": "36d8ca5713449638fe47777cfce8a2058a6dd4a9d146179600158c86999963f4",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 6,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c8",
    "sourceHash": "b8956af708810722db16a8f265df175af995307011f9c0c3e2e5d089e4d8e373",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 1,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c9",
    "sourceHash": "01b8834aeb543f3b54b58783f303bc5e7e90b518a35c29e9472f965f1c692ae2",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c10",
    "sourceHash": "cb746f00932c7196eeb7dbff8ab10271cc898b9ba56ff2b6e07b69cd33b710e4",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c11",
    "sourceHash": "4dd0c4d3177d3e00ab15526dec92d4ba1feda4d20dbe40b584bd132ed80cc376",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c12",
    "sourceHash": "b96ac2bdb0f8b21703e5c9999166d37818fb5dc7e19eb99c8a53cc29c13e0011",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 6,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c13",
    "sourceHash": "56f1584573215d847d65dc1d0a5f8ece0cd62a9c83ecac6e27e4f902f3072304",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 2,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c14",
    "sourceHash": "aa9ac3ba9e9eb32d44ab56a876764e8a2be75780eb8059e1aab2e9a980bb4871",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c15",
    "sourceHash": "78173426489d2b71fc8aa9ec8baaf61917f5d763ee7d5034e4b8f84d446e7093",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 3,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  },
  {
    "id": "c16",
    "sourceHash": "ebc8c2ff567a7450f45f430b0be899e58971aa8cf8872944b3d6d239cc887ba1",
    "approvalRef": "candidate-carnivore-review-20261107",
    "approvalDate": "2026-11-07",
    "serv": 1,
    "imageStatus": "placeholder",
    "license": "proprietary",
    "editorialStatus": "review"
  }
];

export const PREVIEW_RECIPE_IDS: readonly string[] = [
  'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k10',
  'k11', 'k12', 'k13', 'k14', 'k15', 'k16', 'k17', 'k18', 'k19', 'k20',
  'k21', 'k22', 'k23', 'k24', 'k25', 'k26', 'k27', 'k28', 'k29', 'k30',
  'k31', 'k32', 'k33', 'k34',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c13', 'c14', 'c15', 'c16',
];
