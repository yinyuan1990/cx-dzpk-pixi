// Default avatars used when a player has no custom head.
// In the real game ALL avatars are REMOTE (server-hosted OSS urls): registration uses
// HMFHTTPClient.getRandomDefaultAvatar (list of {gender, avatar:url}) and SystemAvatar
// downloads system avatars via AssetsManager.getAvatarUrl(index,{system:true}). The local
// in-game head atlas (common/head/atlasHead.json, head_1..200) has its packed texture
// (15f347722.png) stripped from the dump. So none are extractable offline -> we ship an
// equivalent local placeholder set (extract/gen_default_avatars.py). To use real avatars,
// either wire the remote avatar API at runtime, or drop real PNGs into the heads folder.
export const AVATAR_COUNT = 16

export const DEFAULT_AVATARS = Array.from(
  { length: AVATAR_COUNT },
  (_, i) => `/assets/table/heads/head_${i + 1}.png`,
)

export function randomAvatar() {
  return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)]
}
