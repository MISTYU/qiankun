<template>
  <h1 class="title">
    微前端 demo
  </h1>
  <div class="nav">
    <div class="router" @click="onTo('vueVite')">vue-vite</div>
    <div class="router" @click="onTo('vueWebpack')">vue-webpack</div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
const onTo = (path: string) => {
  router.push({
    name: path
  })
}
</script>

<style scoped>
.nav {
  display: flex;
  justify-content: center;
  margin-top: 50px;
}
.router {
  cursor: pointer;
  margin: 0 20px;
}
</style>
