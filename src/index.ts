import './style.css'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { Types, addComponent, addEntity, createWorld, defineComponent, defineQuery, enterQuery, exitQuery } from 'bitecs';

interface IWorld { }

//
// Components
//

const CPosition = defineComponent({ x: Types.i32, y: Types.i32 })
const CBoundingBox = defineComponent({ x: Types.i32, y: Types.i32, w: Types.i32, h: Types.i32 })
const CRenderRectangle = defineComponent({ w: Types.i32, h: Types.i32, color: Types.ui32 })
const CFollowMouse = defineComponent({})

//
// Systems
//

/*
  Sort all bounding boxes by their minimal x value as BBStarts
  Start looping over the BBStarts
  Add entry to active list
  loop over active list
  check if entry min is higher then active entry max.
        As the list is sorted that means the active entry will never match so remove it from the active list
        Otherwise add to intersection list

  return intersection list
*/
function createColliderSystem() {
    // A list of entity IDs ordered by their bounding box min
    const listX = new Int32Array(10000);
    let listXSize = 0

    const sortList = () => {
        // Sort listX 
        for (let i = 1; i < listXSize; i++) {
            // Loop over all previous values
            for (let back = i; back > 0; back--) {
                const latter = CPosition.x[listX[back]] + CBoundingBox.x[listX[back]]
                const former = CPosition.x[listX[back - 1]] + CBoundingBox.x[listX[back - 1]]
                if (former < latter) break;
                // Otherwise swap the two
                listX[listXSize] = listX[back - 1]
                listX[back - 1] = listX[back]
                listX[back] = listX[listXSize]
            }
        }
    }

    const addHit = (hitMap: Map<number, Set<number>>, a: number, b: number) => {
        let set = hitMap.get(a) ?? new Set<number>();
        set.add(b);
        if (!hitMap.has(a)) {
            hitMap.set(a, set);
        }

        set = hitMap.get(b) ?? new Set<number>();
        set.add(a);
        if (!hitMap.has(b)) {
            hitMap.set(b, set);
        }
    }
    const calculateIntersections = () => {
        const activePool = new Set<number>()
        const hitMap = new Map<number, Set<number>>();

        // Check X potentials
        const overlaps = new Set<[number, number]>();
        for (let ix = 0; ix < listXSize; ix++) {
            const subject = listX[ix]
            for (const active of activePool) {
                // If minX of subject is larger than maxX of active, remove active from pool
                if (CPosition.x[subject] + CBoundingBox.x[subject] > CPosition.x[active] + CBoundingBox.x[active] + CBoundingBox.w[active]) {
                    activePool.delete(active);
                } else {
                    // Otherwise there is an overlap and thus potential collision
                    overlaps.add([
                        Math.min(active, subject),
                        Math.max(active, subject),
                    ])
                }
            }
            activePool.add(subject);
        }

        for (const [a, b] of overlaps) {
            if (!(CPosition.y[a] + CBoundingBox.y[a] + CBoundingBox.h[a] <= CPosition.y[b] + CBoundingBox.y[b] ||
                CPosition.y[b] + CBoundingBox.y[b] + CBoundingBox.h[b] <= CPosition.y[a] + CBoundingBox.y[a])) {
                addHit(hitMap, a, b);
            }
        }

        return hitMap
    }


    const bb = defineQuery([CPosition, CBoundingBox])
    const bbEnter = enterQuery(bb)
    const bbExit = exitQuery(bb)

    let counter = 0;
    let totalDuration = 0;
    return function colliderSystem(world: IWorld) {
        for (const id of bbEnter(world)) {
            listX[listXSize++] = id
        }

        performance.mark('collider:start');
        sortList()
        const hitMap = calculateIntersections()
        for (const [id, hits] of hitMap.entries()) {
            hits.size > 0 && (CRenderRectangle.color[id] = 0xff0000);
        }

        performance.mark('collider:end');
        performance.measure('collider', 'collider:start', 'collider:end');

        const measure = performance.getEntriesByName('collider')[0];
        totalDuration += measure.duration;
        counter++;

        const averageDuration = totalDuration / counter;
        console.log(`Average runtime: ${averageDuration} ms`);

        performance.clearMarks('collider:start');
        performance.clearMarks('collider:end');
        performance.clearMeasures('collider');



        for (const id of bbExit(world)) {
            const idx = listX.indexOf(id)
            listX[idx] = listX[--listXSize];
        }
    }
}

function createRenderSystem(stage: Container) {
    const entityGraphicMap = new Map<number, Graphics>();
    const lastColorCache = new Map<number, number>();

    const rectangles = defineQuery([CPosition, CRenderRectangle])
    const rectanglesEnter = enterQuery(rectangles);
    const rectanglesExit = exitQuery(rectangles);

    return function renderSystem(world: IWorld) {
        for (const id of rectanglesEnter(world)) {
            const g = new Graphics();
            stage.addChild(g)
            entityGraphicMap.set(id, g)
        }
        for (const id of rectangles(world)) {
            const x = CPosition.x[id]
            const y = CPosition.y[id]
            const w = CRenderRectangle.w[id]
            const h = CRenderRectangle.h[id]
            const c = CRenderRectangle.color[id]

            const g = entityGraphicMap.get(id)!
            if (g.x != x || g.y != y) {
                g.x = x
                g.y = y
            }
            if (lastColorCache.get(id) != c) {
                lastColorCache.set(id, c)
                g.clear()
                g.beginFill(c);
                g.drawRect(0, 0, w, h)
                g.endFill()
            }
            CRenderRectangle.color[id] = 0x00ff00

        }
        for (const id of rectanglesExit(world)) {
            const g = entityGraphicMap.get(id)!
            g.destroy()
            entityGraphicMap.delete(id)
        }
    }
}

function createEntityIDDebugSystem(stage: Container) {
    const entityTextMap = new Map<number, Text>();

    const rectangles = defineQuery([CPosition])
    const rectanglesEnter = enterQuery(rectangles);
    const rectanglesExit = exitQuery(rectangles);

    return (world: IWorld) => {
        for (const id of rectanglesEnter(world)) {
            const g = new Text(id.toString())

            stage.addChild(g)
            entityTextMap.set(id, g)
        }
        for (const id of rectangles(world)) {
            const x = CPosition.x[id]
            const y = CPosition.y[id]
            const g = entityTextMap.get(id)!
            g.x = x
            g.y = y

        }
        for (const id of rectanglesExit(world)) {
            const g = entityTextMap.get(id)!
            g.destroy()
            entityTextMap.delete(id)
        }
    }
}

function createFollowMouseSystem() {
    const query = defineQuery([CPosition, CFollowMouse])
    let mouseX = 0;
    let mouseY = 0;

    document.body.addEventListener('mousemove', (e) => {
        mouseX = e.x
        mouseY = e.y
    })

    return function followSystem(world: IWorld) {
        for (const id of query(world)) {
            CPosition.x[id] = mouseX
            CPosition.y[id] = mouseY
        }
    }
}

//
// Prefabs
//

function createBox(world: IWorld, x: number, y: number, w = 50, h = 50): number {
    const id = addEntity(world)

    addComponent(world, CPosition, id)
    CPosition.x[id] = x;
    CPosition.y[id] = y;

    addComponent(world, CRenderRectangle, id)
    CRenderRectangle.w[id] = w;
    CRenderRectangle.h[id] = h;

    addComponent(world, CBoundingBox, id)
    CBoundingBox.x[id] = 0; // Relative to CPosition
    CBoundingBox.y[id] = 0;
    CBoundingBox.w[id] = w;
    CBoundingBox.h[id] = h;

    return id
}

async function entry() {
    const app = new Application({ autoDensity: true, background: '#333333', antialias: true });
    document.body.appendChild(app.view as any);
    app.renderer.resize(document.body.clientWidth, document.body.clientHeight)

    const world = createWorld<IWorld>();

    const render = createRenderSystem(app.stage)
    const debug = createEntityIDDebugSystem(app.stage)
    const collisions = createColliderSystem()
    const follow = createFollowMouseSystem()

    const s = 25
    console.log(`Rendering ${(app.view.width / s) * (app.view.height / s)} cubes`)
    for (let y = 0; y < app.view.height / s; y++)
        for (let x = 0; x < app.view.width / s; x++)
            createBox(world, x * (s + 1), y * (s + 1), s, s)

    const player = addEntity(world)
    addComponent(world, CBoundingBox, player)
    CBoundingBox.x[player] = -25
    CBoundingBox.y[player] = -25
    CBoundingBox.w[player] = 50
    CBoundingBox.h[player] = 50
    addComponent(world, CPosition, player)
    addComponent(world, CFollowMouse, player)

    const loop = () => {
        follow(world)
        render(world)
        //debug(world)
        collisions(world)
        requestAnimationFrame(loop)
    }
    loop();
}

entry()
