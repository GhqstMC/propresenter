// deno-lint-ignore-file
import http from 'http'
import arg from 'arg'
import axios from 'axios'
import { ActivePresentation, ActivePresentationResponse, PresentationIndexResponse, Slide } from './types'

const args = arg({
    '--help': Boolean,
    '--proPresenterHost': String,
    '--proPresenterPort': Number,
    '--midiRelayHost': String,
    '--midiRelayPort': Number,
    '--midiRelayMidiPortName': String,
    '--midiDeviceId': Number,
})

if (args['--help']) {
    console.log(`
    ProPresenterCues v1.0.0

    To use this program, you'll need to do four things:

    1. Enable ProPresenter's Network setting, and add the host and port to --proPresenterHost and --proPresenterPort on this program.
    2. Setup midi-relay on the computer running ChromaQ Vista (tutorials available on Google). You'll need to add the host and port to --midiRelayHost and --midiRelayPort on this program.
    Additionally, you'll need to identify the midi port on the computer running ChromaQ Vista. You'll need to add the port name to --midiRelayMidiPortName on this program.
    3. Ensure the device id in Vista settings and the --midiDeviceId on this program match.
    4. Set up the ProPresenter slide labels to be a variation of "Lights [list number];[cue number]"`)
    process.exit(0)
}

let proPresenterHost = '127.0.0.1'
let proPresenterPort = 1256
let midiRelayHost = '127.0.0.1'
let midiRelayPort = 1257
let midiRelayMidiPortName = 'Port'
let midiDeviceId = 0

if (args['--proPresenterHost'] == null) {
    console.log(`You did not specify a ProPresenter network host, defaulting to "${proPresenterHost}". To fix this, add --proPresenterHost <host>`)
} else {
    proPresenterHost = args['--proPresenterHost']
}

if (args['--proPresenterPort'] == null) {
    console.log(`You did not specify a ProPresenter network port, defaulting to ${proPresenterPort}. To fix this, add --proPresenterPort <port>`)
} else {
    proPresenterPort = args['--proPresenterPort']
}

if (args['--midiRelayHost'] == null) {
    console.log(`You did not specify a midi-relay network host, defaulting to "${midiRelayHost}". To fix this, add --midiRelayHost <host>`)
} else {
    midiRelayHost = args['--midiRelayHost']
}

if (args['--midiRelayPort'] == null) {
    console.log(`You did not specify a midi-relay network port, defaulting to ${midiRelayPort}. To fix this, add --midiRelayPort <port>`)
} else {
    midiRelayPort = args['--midiRelayPort']
}

if (args['--midiRelayMidiPortName'] == null) {
    console.log(`You did not specify a midi-relay MIDI port name, defaulting to "${midiRelayMidiPortName}". To fix this, add --midiRelayMidiPortName <port>`)
} else {
    midiRelayMidiPortName = args['--midiRelayMidiPortName']
}

if (args['--midiDeviceId'] == null) {
    console.log(`You did not specify a MIDI device id, defaulting to ${midiDeviceId}. To fix this, add --midiDeviceId <id>`)
} else {
    midiDeviceId = args['--midiDeviceId']
}

let activePresentation: ActivePresentation | null = null
let presentationSlides: Slide[] = []
let slideIndex: number = 0

let first = false

let lastSentCue: string[] = []

const options1: http.RequestOptions = {
    hostname: proPresenterHost,
    port: proPresenterPort,
    path: '/v1/presentation/active?chunked=true',
    method: 'GET',

};

const options2: http.RequestOptions = {
    hostname: proPresenterHost,
    port: proPresenterPort,
    path: '/v1/presentation/slide_index?chunked=true',
    method: 'GET',
};

let timeout: any = null

function arrayEquals<T>(a: T[], b: T[]) {
    return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
}

function processSlideIndex(json: any) {
    slideIndex = json.presentation_index.index
    const label: string = presentationSlides[slideIndex].label
    const match = label.match(/Lights (\d+);(\d+)/)
    if (match !== null) {
        let cues = [match[1], match[2]]
        const [list, cue] = cues
        if (!arrayEquals(lastSentCue, cues)) {
            lastSentCue = cues
            console.log(`Jumping to cue ${cue} of list ${list}`)
            axios.post('http://' + midiRelayHost + ':' + midiRelayPort, {
                midiport: midiRelayMidiPortName,
                midicommand: 'msc',
                deviceid: midiDeviceId,
                commandformat: 'lighting.general',
                command: 'go',
                cue,
                cuelist: list
            }).catch(err => {
                console.log(`Failed to send midi-relay request: `)
            })
        }
    }
}

const establishRequest = () => {
    timeout = null

    const req1 = http.request(options1, (res: any) => {
        if (res.statusCode === 200) {
            console.log('Connected to active presentation')
        } else {
            console.log(`Error connecting to active presentation: ${res.statusCode}`)
        }
    
        res.on('data', (data: any) => {
            const json: ActivePresentationResponse = JSON.parse(data)
            if (json.presentation == null) return
            activePresentation = json.presentation
            presentationSlides = []
            activePresentation.groups.forEach((group) => {
                presentationSlides = presentationSlides.concat(group.slides)
            })
        });
    });
    
    const req2 = http.request(options2, (res: any) => {
        if (res.statusCode === 200) {
            console.log('Connected to slide index')
        } else {
            console.log(`Error connecting to slide index: ${res.statusCode}`)
        }
    
        res.on('data', (data: any) => {
            if (!first) {
                first = true
                return
            }
            const json: PresentationIndexResponse = JSON.parse(data)
            if (json.presentation_index == null) return

            if (activePresentation == null || json.presentation_index.presentation_id.uuid !== activePresentation.id.uuid) {

                setTimeout(() => { processSlideIndex(json) }, 200)
            } else {
                processSlideIndex(json)
            }
    
        });
    });
    
    
    req1.on('error', (error: any) => {
        // console.log('error')
        if (timeout == null) {
            timeout = setTimeout(() => {
                console.log('Retrying')
                establishRequest()
            }, 3000)
        }
        
    });

    req2.on('error', (error: any) => {
        console.log('Failed to connect... ProPresenter probably isn\'t awake')
        if (timeout == null) {
            timeout = setTimeout(() => {
                console.log('restarting')
                establishRequest()
            }, 3000)
        }
    });
    
    req1.end();
    req2.end();
    
}

establishRequest()
