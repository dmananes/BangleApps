{
  let minimumBmpConfidence = 80
  let fr = 60

  let storageFile // file for GPS track
  let storageFilefr
  let entriesWritten = 0
  let activeRecorders = []
  let writeInterval

  let loadSettings = function () {
    var settings = require('Storage').readJSON('apptivate.json', 1) || {}
    settings.period = settings.period || 1
    settings.fr = settings.fr || 60
    if (!settings.file || !settings.file.startsWith('apptivate.log')) settings.recording = false
    return settings
  }

  let updateSettings = function (settings) {
    require('Storage').writeJSON('apptivate.json', settings)
    if (WIDGETS['apptivate']) WIDGETS['apptivate'].reload()
  }

  let getRecorders = function () {
    var recorders = {
      gps: function () {
        var lat = 0
        var lon = 0
        var alt = 0
        var samples = 0
        var hasFix = 0
        function onGPS(f) {
          hasFix = f.fix
          if (!hasFix) return
          lat += f.lat
          lon += f.lon
          alt += f.alt
          samples++
        }
        return {
          isFrequent: false,
          name: 'GPS',
          fields: ['Latitude', 'Longitude', 'Altitude'],
          getValues: () => {
            var r = ['', '', '']
            if (samples) r = [(lat / samples).toFixed(6), (lon / samples).toFixed(6), Math.round(alt / samples)]
            samples = 0
            lat = 0
            lon = 0
            alt = 0
            return r
          },
          start: () => {
            hasFix = false
            Bangle.on('GPS', onGPS)
            Bangle.setGPSPower(1, 'apptivate')
          },
          stop: () => {
            hasFix = false
            Bangle.removeListener('GPS', onGPS)
            Bangle.setGPSPower(0, 'apptivate')
          },
          draw: (x, y) => g.setColor(hasFix ? '#0f0' : '#f88').drawImage(atob('DAwBEAKARAKQE4DwHkPqPRGKAEAA'), x, y)
        }
      },
      acc: function () {
        var x = '',
          y = '',
          z = '',
          diff = '',
          mag = ''
        function onACC(acc) {
          x = Math.round(acc.x * 100) / 100
          y = Math.round(acc.y * 100) / 100
          z = Math.round(acc.z * 100) / 100
          diff = Math.round(acc.diff * 100) / 100
          mag = Math.round(acc.mag * 100) / 100
        }
        return {
          isFrequent: true,
          name: 'ACC',
          fields: ['ACC_X', 'ACC_Y', 'ACC_Z', 'DIFF', 'MAG'],
          getValues: () => {
            var r = [x, y, z, diff, mag]
            x = ''
            y = ''
            z = ''
            diff = ''
            mag = ''
            return r
          },
          start: () => {
            Bangle.on('accel', onACC)
          },
          stop: () => {
            Bangle.removeListener('accel', onACC)
          },
          draw: (x, y) => g.reset().drawImage(atob('DAwBAAMMeeeeeeeecOMMAAMMMMAA'), x, y)
        }
      },
      mag: function () {
        var x = '',
          y = '',
          z = '',
          dx = '',
          dy = '',
          dz = '',
          heading = ''
        function onMAG(mag) {
          x = mag.x
          y = mag.y
          z = mag.z
          dx = mag.dx
          dy = mag.dy
          dz = mag.dz
          heading = Math.round(mag.heading)
        }
        return {
          isFrequent: true,
          name: 'MAG',
          fields: ['MAG_X', 'MAG_Y', 'MAG_Z', 'DX', 'DY', 'DZ', 'HEADING'],
          getValues: () => {
            var r = [x, y, z, dx, dy, dz, heading]
            x = ''
            y = ''
            z = ''
            dx = ''
            dy = ''
            dz = ''
            heading = ''
            return r
          },
          start: () => {
            Bangle.on('mag', onMAG)
            Bangle.setCompassPower(1, 'apptivate')
          },
          stop: () => {
            Bangle.removeListener('mag', onMAG)
            Bangle.setCompassPower(0, 'apptivate')
          },
          draw: (x, y) => g.reset().drawImage(atob('DAwBAAMMeeeeeeeecOMMAAMMMMAA'), x, y)
        }
      },
      hrm: function () {
        var bpm = ''
        function onHRM(h) {
          if (h.confidence >= minimumBmpConfidence) {
            bpm = h.bpm
          } else {
            bpm = ''
          }
        }
        return {
          isFrequent: false,
          name: 'HR',
          fields: ['Heartrate'],
          getValues: () => {
            var r = [bpm]
            bpm = ''
            return r
          },
          start: () => {
            Bangle.on('HRM', onHRM)
            Bangle.setHRMPower(1, 'apptivate')
          },
          stop: () => {
            Bangle.removeListener('HRM', onHRM)
            Bangle.setHRMPower(0, 'apptivate')
          },
          draw: (x, y) => g.setColor(Bangle.isHRMOn() ? '#f00' : '#f88').drawImage(atob('DAwBAAAAMMeef+f+f+P8H4DwBgAA'), x, y)
        }
      },
      bat: function () {
        return {
          isFrequent: false,
          name: 'BAT',
          fields: ['Battery Percentage', 'Battery Voltage', 'Charging'],
          getValues: () => {
            return [E.getBattery(), NRF.getBattery(), Bangle.isCharging()]
          },
          start: () => {},
          stop: () => {},
          draw: (x, y) => g.setColor(Bangle.isCharging() ? '#0f0' : '#ff0').drawImage(atob('DAwBAABgH4G4EYG4H4H4H4GIH4AA'), x, y)
        }
      },
      steps: function () {
        var lastSteps = 0
        return {
          isFrequent: false,
          name: 'Steps',
          fields: ['Steps'],
          getValues: () => {
            var c = Bangle.getStepCount(),
              r = [c - lastSteps]
            lastSteps = c
            return r
          },
          start: () => {
            lastSteps = Bangle.getStepCount()
          },
          stop: () => {},
          draw: (x, y) => g.reset().drawImage(atob('DAwBAAMMeeeeeeeecOMMAAMMMMAA'), x, y)
        }
      }
    }
    if (Bangle.getPressure) {
      recorders['baro'] = function () {
        var temp = '',
          press = '',
          alt = ''
        function onPress(c) {
          temp = Math.round(c.temperature)
          press = Math.round(c.pressure)
          alt = Math.round(c.altitude)
        }
        return {
          isFrequent: false,
          name: 'Baro',
          fields: ['Barometer Temperature', 'Barometer Pressure', 'Barometer Altitude'],
          getValues: () => {
            var r = [temp, press, alt]
            temp = ''
            press = ''
            alt = ''
            return r
          },
          start: () => {
            Bangle.setBarometerPower(1, 'apptivate')
            Bangle.on('pressure', onPress)
          },
          stop: () => {
            Bangle.setBarometerPower(0, 'apptivate')
            Bangle.removeListener('pressure', onPress)
          },
          draw: (x, y) => g.setColor('#0f0').drawImage(atob('DAwBAAH4EIHIEIHIEIHIEIEIH4AA'), x, y)
        }
      }
    }

    /* eg. foobar.apptivate.js
    (function(recorders) {
      recorders.foobar = {
        name : "Foobar",
        fields : ["foobar"],
        getValues : () => [123],
        start : () => {},
        stop : () => {},
        draw (x,y) => {} // draw 12x12px status image
      }
    })
    */
    require('Storage')
      .list(/^.*\.apptivate\.js$/)
      .forEach((fn) => eval(require('Storage').read(fn))(recorders))
    return recorders
  }

  let writeLog = function () {
    WIDGETS['apptivate'].draw()
    try {
      var fields = [Math.round(getTime())]
      var fieldsfr = [Math.round(getTime())]
      activeRecorders.forEach((recorder) => {
        if (!recorder.isFrequent) fields.push.apply(fields, recorder.getValues())
        else fieldsfr.push.apply(fieldsfr, recorder.getValues())
      })

      if (storageFilefr) storageFilefr.write(fieldsfr.join(',') + '\n')
      if (entriesWritten % fr == 0) {
        if (storageFile) storageFile.write(fields.join(',') + '\n')
      }

      entriesWritten++
    } catch (e) {
      // If storage.write caused an error, disable
      // GPS recording so we don't keep getting errors!
      console.log('apptivate: error', e)
      var settings = loadSettings()
      settings.recording = false
      require('Storage').write('apptivate.json', settings)
      reload()
    }
  }

  // Called by the GPS app to reload settings and decide what to do
  let reload = function () {
    var settings = loadSettings()
    if (writeInterval) clearInterval(writeInterval)
    writeInterval = undefined

    activeRecorders.forEach((rec) => rec.stop())
    activeRecorders = []
    entriesWritten = 0

    if (settings.recording) {
      fr = settings.fr
      // set up recorders
      var recorders = getRecorders() // TODO: order??
      settings.record.forEach((r) => {
        var recorder = recorders[r]
        if (!recorder) {
          console.log(/*LANG*/ 'Recorder for ' + E.toJS(r) + /*LANG*/ '+not found')
          return
        }
        var activeRecorder = recorder()
        activeRecorder.start()
        activeRecorders.push(activeRecorder)
        // TODO: write field names?
      })
      WIDGETS['apptivate'].width = 15 + ((activeRecorders.length + 1) >> 1) * 12 // 12px per recorder
      // open/create file
      if (require('Storage').list(settings.file).length) {
        // Append
        storageFile = require('Storage').open(settings.file, 'a')
        storageFilefr = require('Storage').open(settings.filefr, 'a')
        // TODO: what if loaded modules are different??
      } else {
        storageFile = require('Storage').open(settings.file, 'w')
        storageFilefr = require('Storage').open(settings.filefr, 'w')
        // New file - write headers
        var fields = ['Time']
        var fieldsfr = ['Time']
        activeRecorders.forEach((recorder) => {
          if (!recorder.isFrequent) fields.push.apply(fields, recorder.fields)
          else fieldsfr.push.apply(fieldsfr, recorder.fields)
        })
        storageFile.write(fields.join(',') + '\n')
        storageFilefr.write(fieldsfr.join(',') + '\n')
      }
      // start recording...
      WIDGETS['apptivate'].draw()
      writeInterval = setInterval(writeLog, settings.period * 1000)
    } else {
      WIDGETS['apptivate'].width = 0
      storageFile = undefined
      storageFilefr = undefined
    }
  }
  // add the widget
  WIDGETS['apptivate'] = {
    area: 'tl',
    width: 0,
    draw: function () {
      if (!writeInterval) return
      g.reset().drawImage(atob('DRSBAAGAHgDwAwAAA8B/D/hvx38zzh4w8A+AbgMwGYDMDGBjAA=='), this.x + 1, this.y + 2)
      activeRecorders.forEach((recorder, i) => {
        recorder.draw(this.x + 15 + (i >> 1) * 12, this.y + (i & 1) * 12)
      })
    },
    getRecorders: getRecorders,
    reload: function () {
      reload()
      Bangle.drawWidgets() // relayout all widgets
    },
    setRecording: function (isOn, forceAppend) {
      var settings = loadSettings()
      if (isOn && !settings.recording && !settings.file) {
        settings.file = 'apptivate.log0.csv'
        settings.filefr = 'apptivate.logfr0.csv'
      } else if (isOn && !forceAppend && !settings.recording && require('Storage').list(settings.file).length) {
        var logfiles = require('Storage').list(/recorder.log.*/)
        var maxNumber = 0
        for (var c of logfiles) {
          maxNumber = Math.max(maxNumber, c.match(/\d+/)[0])
        }
        var newFileName
        if (maxNumber < 99) {
          newFileName = 'apptivate.log' + (maxNumber + 1) + '.csv'
          newFileNamefr = 'apptivate.logfr' + (maxNumber + 1) + '.csv'
          updateSettings(settings)
        }
        var buttons = { /*LANG*/ Yes: 'overwrite', /*LANG*/ No: 'cancel' }
        if (newFileName) buttons[/*LANG*/ 'New'] = 'new'
        buttons[/*LANG*/ 'Append'] = 'append'
        return E.showPrompt(/*LANG*/ 'Overwrite\nLog ' + settings.file.match(/\d+/)[0] + '?', { title: /*LANG*/ 'Apptivate', buttons: buttons }).then((selection) => {
          if (selection === 'cancel') return false // just cancel
          if (selection === 'overwrite') require('Storage').open(settings.file, 'r').erase()
          if (selection === 'new') {
            settings.file = newFileName
            settings.filefr = newFileNamefr
            updateSettings(settings)
          }
          // if (selection==="append") // we do nothing - all is fine
          return WIDGETS['apptivate'].setRecording(1, true /*force append*/)
        })
      }
      settings.recording = isOn
      updateSettings(settings)
      WIDGETS['apptivate'].reload()
      return Promise.resolve(settings.recording)
    },
    plotTrack: function (m) {
      // m=instance of openstmap module
      // Plots the current track in the currently set color
      if (!activeRecorders.length) return // not recording
      var settings = loadSettings()
      // keep function to draw track in RAM
      function plot(g) {
        'ram'
        var f = require('Storage').open(settings.file, 'r')
        var l = f.readLine()
        if (l === undefined) return // empty file?
        var mp,
          c = l.split(',')
        var la = c.indexOf('Latitude'),
          lo = c.indexOf('Longitude')
        if (la < 0 || lo < 0) return // no GPS!
        l = f.readLine()
        c = []
        while (l && !c[la]) {
          c = l.split(',')
          l = f.readLine(f)
        }
        if (l === undefined) return // empty file?
        mp = m.latLonToXY(+c[la], +c[lo])
        g.moveTo(mp.x, mp.y)
        l = f.readLine(f)
        var n = 200 // only plot first 200 points to keep things fast(ish)
        while (l && n--) {
          c = l.split(',')
          if (c[la]) {
            mp = m.latLonToXY(+c[la], +c[lo])
            g.lineTo(mp.x, mp.y)
          }
          l = f.readLine(f)
        }
      }
      plot(g)
    }
  }
  // load settings, set correct widget width
  reload()
}
