import store from '@/store'

export default (to, from, next) => {
  let auth = store.getters.isLogin
  if (auth) {
    next({ name: 'Home' })
    return false
  }
}
