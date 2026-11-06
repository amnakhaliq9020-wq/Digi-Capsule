# 06 — AI avatar architecture

Status: Phase 2 design only. Do not implement voice cloning, face cloning, or a conversational agent while building the MVP. Do not add paid AI SDKs during roadmap setup.

Phase 2 starts after calendar delivery, check-ins, deletion, and the verification flag have a real operating record, and after a written consent design is reviewed.

## Purpose

An optional, clearly synthetic guide that helps an authorized family member explore memories the author already approved. It is a navigation layer over the archive. It is not the author, not a witness, and not a source of new facts.

## What the author can choose to provide

All inputs are opt-in and separable:

| Input | Use | Consent |
| --- | --- | --- |
| Selected letters, captions, and transcripts | Retrieval corpus | Per item include/exclude. Default exclude |
| Voice recordings designated for cloning | Voice model | Separate `voice_replica` consent |
| Photographs or video designated for a face model | Likeness model | Separate `likeness_replica` consent |
| Short author-written style notes | Tone hints inside the prompt | Included only if the author saves them for this purpose |
| Topic block list | Hard refusal | Author-edited anytime |

Using a photo inside a capsule must not automatically enroll it in a face model. The default is archive-only.

## Consent requirements

Before any provider receives biometric or likeness data:

1. Show a plain-language explanation: what is created, who will see it, that output is synthetic, that it can be wrong, how to delete it, and whether a provider keeps a copy.
2. Record `consent_records` with purpose, policy version, and timestamp.
3. Require the author to be MFA-authenticated for this action.
4. Re-consent if the provider or the policy version changes.
5. Allow refusal of voice, refusal of face, or refusal of chat, independently.
6. Posthumous use is a separate purpose (`avatar_posthumous_use`). If it was not granted, a verification release of ordinary letters still happens, and the avatar stays off.
7. Revocation stops new sessions and starts deletion. It cannot recall a video a family member already downloaded. Say that in the consent text.

Family members cannot enroll the author's face or voice. A "build an avatar of my parent from photos I have" flow is out of scope and should be rejected in product policy, not only omitted.

## Runtime boundaries

```mermaid
flowchart LR
  question[Recipient question]
  authz[Grant and consent check]
  retrieve[Retrieve approved items]
  draft[Model drafts an answer]
  guard[Grounding and topic guard]
  label[Attach synthetic label]
  show[Portal playback]

  question --> authz
  authz --> retrieve
  retrieve --> draft
  draft --> guard
  guard --> label
  label --> show
```

Rules for the guard:

- Answers may quote or paraphrase retrieved items and must cite item ids the UI can open.
- If retrieval is empty or weak, the response is a refusal: the archive does not contain that answer. The model must not fill the gap with a plausible life story.
- Restricted topics return a refusal without generating the forbidden content.
- The system prompt states the speaker is a synthetic guide built from selected materials.
- The UI shows a persistent label on every generated audio and video frame, not only in a footer the user can miss. Suggested wording: "Computer-generated voice" and "Computer-generated video." Do not use the author's name alone as the speaker label.
- Generated text is visually distinct from original letters.
- The guide cannot change grants, schedules, verifiers, or check-ins.
- The guide cannot claim "I never told anyone this" or issue instructions that are not in a retrieved item, including financial, medical, or legal instructions. Those categories should refuse and point to the original documents if any exist.

## Provider evaluation

Do not train a foundation model. Compare vendors at the time of Milestone 7 and write a short decision record. Categories:

| Capability | What to compare | Data-handling questions |
| --- | --- | --- |
| Voice cloning | Sample length required, language coverage, streaming vs file, price per minute, whether the vendor retains audio | Training opt-out, deletion API, subprocessors, region, biometric policy |
| Speech synthesis with a cloned voice | Latency, file export, watermarking | Can a watermark survive? If not, the product label still has to carry the disclosure |
| Face or video avatar | Photo vs video input, uncanny-failure modes, render cost per minute | Likeness retention, celebrity or third-party face filters, abuse monitoring |
| Conversational model | Context window, tool use for retrieval, citation behavior | Whether prompts and family questions are used for training |
| Embeddings / retrieval | Self-hosted open embeddings vs a vendor API | Keep embeddings in the same region as the archive if possible |

Candidate classes, not endorsements: commercial voice-clone APIs, commercial talking-head APIs, and a general model API used only as a cited reader over retrieved chunks. Self-hosting an open model is an option if a vendor's retention terms are unacceptable. Self-hosting does not remove the safety rules above, and it adds GPU operations the MVP should not carry.

**Costs are unknown until quotes are collected.** Cost drivers to price before a beta:

- One-time enrollment per voice and face.
- Minutes of synthesized speech and rendered video.
- Tokens and embedding storage per question.
- Failed renders and retries.
- Vendor minimums.

The cost-conscious plan: ship Phase 1 with no GPU and no avatar contract. In Milestone 7, prototype **text-only grounded Q&A** over approved letters before any voice or face spend. Add voice only if authors ask for it and deletion works in the text prototype. Add face last. It is the highest emotional and impersonation risk and usually the highest cost.

## Knowledge retrieval

- Chunk only items with `knowledge_sources` inclusion and status `released` to that recipient, or items the author marked previewable to that recipient during the author's lifetime. A recipient must not use the guide to learn about items they cannot open.
- Store chunk text encrypted at rest, same as letters, or derive chunks at query time from ciphertext. Prefer query-time derivation if the corpus is small, to avoid a second plaintext store.
- Log question metadata sparingly. Family questions can be as sensitive as the archive. Default: do not retain full transcripts (Q-11).

## Safety risks

| Risk | Mitigation |
| --- | --- |
| Impersonation or fraud using the voice | Enrollment only by the MFA-authenticated author. Synthetic label. No public sharing links for avatar sessions. Rate limits. Revocation |
| Emotional manipulation | Refuse to invent reassurance that is not in the archive. Avoid a mode that pressures recipients to keep talking. No ads. No engagement optimization |
| False statements | Grounding and citations. Refusal on weak retrieval |
| Privacy of third parties in the stories | Author can exclude items and topics. The guide is not a place to mine other people's data |
| Provider breach | Minimize what is uploaded. Prefer vendors that delete enrollment audio. Record subprocessors |
| Posthumous wishes unclear | Separate consent purpose. Heirs do not get to expand the corpus |
| Children talking to a replica of a parent | Additional friction: guardian controls, session time guidance, and a decision whether minors may use the avatar at all (Q-12) |
| Unauthorized modification of the replica | No family editing of the voice model. Style notes are author-only |

A watermark is helpful and insufficient. Family members can re-record speakers. The product still labels output and keeps an audit trail of generation events.

## Deletion

Revoke or account delete must:

1. Call the provider's delete API and record the response.
2. Delete local samples designated for cloning, embeddings, and replica ids.
3. Leave original capsule media intact unless the author is deleting those items too. Cloning consent is not the same switch as "delete my photographs."
4. Disable sessions immediately, even if the provider deletion is delayed. Alert if the provider call fails.

## Phase 2 module placement

Future `apps/api/src/modules/avatar/` with ports:

- `VoiceReplicaPort`
- `LikenessPort`
- `ReaderPort` (chat plus retrieval)

`packages/domain` stays free of vendor SDKs. A fake in-memory reader is the only implementation allowed in tests.

## Acceptance bar before any external user tries an avatar

- Consent records visible to the author.
- Revocation tested against a sandbox vendor or a fake port that asserts delete was called.
- Ten scripted questions: five answerable from fixtures, five absent. Absent ones must refuse.
- A restricted topic must refuse.
- UI review shows the synthetic label on audio.
- A recipient without a grant cannot open a session.
- No Phase 2 code path writes a `capsule_item` that could be confused with an uploaded letter.
