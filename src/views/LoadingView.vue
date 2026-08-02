<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
// 1:1 还原自逆向 loadingScene.fire（需求说明 §3.2 节点树）。
// 设计分辨率 1080×2338，fitWidth：所有尺寸/锚定偏移 = 设计px * var(--s)。
const { t } = useI18n()
const router = useRouter()
const percent = ref(0)
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    percent.value = Math.min(100, percent.value + Math.random() * 7 + 2)
    if (percent.value >= 100) {
      clearInterval(timer)
      timer = setTimeout(() => router.push('/login'), 500)
    }
  }, 180)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div class="stage-root loading">
    <!-- bg: Widget(45) 全拉伸 → cover 填充整屏 -->
    <img class="bg" src="/assets/loading/background_phone.png" alt="bg" />

    <!-- worldCupLogo: TOP|HCENTER, top=345, 553×851 -->
    <img class="wc" src="/assets/loading/world_cup_logo.png" alt="worldCupLogo" />

    <!-- main: 立绘 2553×2338, 居中 -->
    <img class="main" src="/assets/loading/main_phone.png" alt="main" />

    <!-- logo: LEFT|TOP, left=60 top=215, 706×97 -->
    <img class="logo" src="/assets/loading/app_logo.png" alt="logo" />

    <!-- solgan: BOTTOM|HCENTER, bottom=530, 1012×296 -->
    <img class="slogan" src="/assets/loading/slogan_cn.png" alt="slogan" />

    <!-- bottomShadow: BOTTOM|LEFT|RIGHT, 1080×626 -->
    <img class="bottom" src="/assets/loading/bottom_phone.png" alt="bottomShadow" />

    <!-- website: Label, bottom=206 -->
    <div class="website">www.wpk.com</div>

    <!-- web_load: BOTTOM|HCENTER bottom=292, Layout(VERTICAL spacingY=10) -->
    <div class="webload">
      <div class="lb">{{ t('loading.loading') }} {{ Math.floor(percent) }}%</div>
      <div class="track">
        <div class="fill" :style="{ width: percent + '%' }"></div>
      </div>
      <div class="hint">{{ t('loading.tip') }}</div>
    </div>
  </div>
</template>

<style scoped>
.loading {
  background: #000;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wc {
  position: absolute;
  top: calc(345px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(553px * var(--s));
  height: calc(851px * var(--s));
}

.main {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: calc(2553px * var(--s));
  height: calc(2338px * var(--s));
  object-fit: contain;
}

.logo {
  position: absolute;
  left: calc(60px * var(--s));
  top: calc(215px * var(--s));
  width: calc(706px * var(--s));
  height: calc(97px * var(--s));
}

.slogan {
  position: absolute;
  bottom: calc(530px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(1012px * var(--s));
  height: calc(296px * var(--s));
}

.bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: calc(626px * var(--s));
}

.website {
  position: absolute;
  bottom: calc(206px * var(--s));
  left: 0;
  width: 100%;
  text-align: center;
  color: #d8e2ef;
  font-size: calc(44px * var(--s));
  letter-spacing: calc(2px * var(--s));
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.webload {
  position: absolute;
  bottom: calc(292px * var(--s));
  left: 50%;
  transform: translateX(-50%);
  width: calc(960px * var(--s));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(10px * var(--s));
}

.webload .lb {
  color: #fff;
  font-size: calc(30px * var(--s));
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}

.track {
  width: calc(960px * var(--s));
  height: calc(12px * var(--s));
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  overflow: hidden;
}

.fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #ffd36b, #ff9e3d);
  transition: width 0.12s linear;
}

.webload .hint {
  color: #e9eef6;
  font-size: calc(30px * var(--s));
  opacity: 0.85;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
</style>
