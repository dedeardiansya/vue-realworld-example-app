<template>
  <div v-if="openModal" class="wrapper">
    <div>
      <button class="btn btn-danger" @click="stopCall()">HANG UP</button>
    </div>
    <video ref="local" class="video-local" muted></video>
    <video ref="remote" class="video-remote"></video>
  </div>
</template>

<script>
import socket from '@/common/socket'
import PubSub from 'pubsub-js'
import 'webrtc-adapter'
import Peer from 'simple-peer-light'

export default {
  data() {
    return {
      calling: false,
      openModal: false,
      peer: null,
      stream: null,
      loading: false,
      user: null,
      signalId: '',
      type: '',
    }
  },
  methods: {
    getStream(cb) {
      if (this.stream) {
        this.stream.getTracks().forEach(function (track) {
          track.stop()
        })
      }
      window.navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: { frameRate: 10 },
        })
        .then((stream) => {
          this.stream = stream
          const video = this.$refs.local
          if ('srcObject' in video) {
            video.srcObject = stream
          } else {
            video.src = window.URL.createObjectURL(stream)
          }
          video.onloadedmetadata = function () {
            video.play()
          }
          cb()
        })
        .catch((e) => {
          console.log(e)
        })
    },
    onRemoteStream(stream) {
      const video = this.$refs.remote
      if ('srcObject' in video) {
        video.srcObject = stream
      } else {
        video.src = window.URL.createObjectURL(stream)
      }
      video.onloadedmetadata = function () {
        video.play()
      }
    },
    signaling() {
      this.getStream(() => {
        this.peer = new Peer({
          initiator: this.initiator,
          stream: this.stream,
          channelName: this.signalId,
          config: {
            ...(() => {
              if (process.env.NODE_ENV === 'production') {
                return {
                  iceServers: [
                    {
                      urls: process.env.VUE_APP_STUN_URL,
                      username: process.env.VUE_APP_STUN_USERNAME,
                      credential: process.env.VUE_APP_STUN_CREDENTIAL,
                    },
                  ],
                }
              }
              return {}
            })(),
          },
        })
        this.peer.on('signal', (data) => {
          socket.emit('SIGNAL', this.signalId, data)
        })
        socket.on('SIGNAL', (data) => {
          this.peer.signal(data)
        })
        this.peer.on('stream', this.onRemoteStream)
        this.peer.on('close', () => {
          this.stopCall()
        })
        this.peer.on('error', (e) => {
          this.stopCall(e)
        })
      })
    },
    stopCall(e) {
      socket.off('SIGNAL')
      if (this.signalId) {
        socket.emit('CLEAR_SIGNAL', this.signalId)
        this.signalId = ''
      }
      if (this.peer) {
        this.peer.destroy()
        this.peer = null
      }
      if (this.stream) {
        this.stream.getTracks().forEach(function (track) {
          track.stop()
        })
        this.stream = null
      }
      this.calling = false
      this.openModal = false
      if (e) {
        this.$toast.error(e)
      }
    },
  },
  mounted() {
    socket.on('CALL', (user, signalId, cb) => {
      if (this.calling) return cb('ON_CALLING')
      this.calling = true
      this.signalId = signalId
      this.initiator = false
      this.user = user
      let time = setTimeout(() => {
        cb('NO_RESPONSE')
        this.$confirm.close()
        this.stopCall('Call ended')
      }, 10000)
      this.$confirm({
        message: `${user.name.toUpperCase()} calling you?`,
        button: { no: 'Reject', yes: 'Accept' },
        callback: (confirm) => {
          clearTimeout(time)
          if (confirm) {
            let time2 = setTimeout(() => {
              this.stopCall('Call ended 1')
            }, 5000)
            socket.emit('PING_SIGNAL', signalId, (err) => {
              clearTimeout(time2)
              if (this.calling) {
                if (err) {
                  return this.stopCall('Call ended 2')
                }
                this.openModal = true
                this.signaling()
                cb()
              }
            })
          } else {
            this.stopCall('Call rejected')
            cb('REJECTED')
          }
        },
      })
    })
    PubSub.subscribe('CALL', (msg, targetid) => {
      this.initiator = true
      this.calling = true
      this.openModal = true
      socket.emit('CALL', targetid, (err, user, signalId) => {
        if (this.calling) {
          if (err) {
            this.$toast.error(err)
            return this.stopCall()
          }
          this.signalId = signalId
          this.user = user
          this.signaling()
        }
      })
    })
    socket.on('PING_SIGNAL', (cb) => {
      if (this.calling) {
        cb(false)
      } else {
        cb(true)
      }
    })
  },
}
</script>

<style lang="scss">
.wrapper {
  position: fixed;
  z-index: 999999;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba($dark, 0.8);
  display: flex;
  .video-local {
    position: absolute;
    z-index: 5;
    width: 20vw;
    right: 5vh;
    bottom: 5vh;
  }
  .video-remote {
    display: block;
    width: 100%;
    height: 100%;
  }
  .btn {
    position: absolute;
    z-index: 10;
    bottom: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
  }
}
</style>
