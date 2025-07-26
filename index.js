import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const vertex = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;
  uniform float u_maxExtrusion;

  void main() {

    vec3 newPosition = position;
    if(u_maxExtrusion > 1.0) newPosition.xyz = newPosition.xyz * u_maxExtrusion + sin(u_time);
    else newPosition.xyz = newPosition.xyz * u_maxExtrusion;

    gl_Position = projectionMatrix * modelViewMatrix * vec4( newPosition, 1.0 );

  }
`;
const fragment = `
  #ifdef GL_ES
  precision mediump float;
  #endif

  uniform float u_time;

  vec3 colorA = vec3(0.196, 0.631, 0.886);
  vec3 colorB = vec3(0.192, 0.384, 0.498);

  void main() {

    vec3  color = vec3(0.0);
    float pct   = abs(sin(u_time));
          color = mix(colorA, colorB, pct);

    gl_FragColor = vec4(color, 1.0);

  }
`;

const container = document.querySelector(".container");
const canvas = document.querySelector(".canvas");

let sizes,
  scene,
  camera,
  renderer,
  controls,
  raycaster,
  mouse,
  isIntersecting,
  twinkleTime,
  materials,
  material,
  baseMesh,
  minMouseDownFlag,
  mouseDown,
  grabbing,
  flyingLines,
  flyingLineMaterials;

const setScene = () => {
  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(30, sizes.width / sizes.height, 1, 1000);
  camera.position.z = 100;

  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: false,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const pointLight = new THREE.PointLight(0x081b26, 17, 200);
  pointLight.position.set(-50, 0, 60);
  scene.add(pointLight);
  scene.add(new THREE.HemisphereLight(0xffffbb, 0x080820, 1.5));

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  isIntersecting = false;
  minMouseDownFlag = false;
  mouseDown = false;
  grabbing = false;

  setControls();
  setBaseSphere();
  setShaderMaterial();
  setMap();
  setFlyingLines();
  resize();
  listenTo();
  render();
};

const setControls = () => {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = Math.PI / 2 - 0.5;
  controls.maxPolarAngle = Math.PI / 2 + 0.5;
};

const setBaseSphere = () => {
  const baseSphere = new THREE.SphereGeometry(19.5, 35, 35);
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b2636,
    transparent: true,
    opacity: 0.9,
  });
  baseMesh = new THREE.Mesh(baseSphere, baseMaterial);
  scene.add(baseMesh);
};

const setShaderMaterial = () => {
  twinkleTime = 0.03;
  materials = [];
  material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      u_time: { value: 1.0 },
      u_maxExtrusion: { value: 1.0 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
  });
};

const setFlyingLines = () => {
  flyingLines = [];
  flyingLineMaterials = [];

  // 飞线的顶点着色器
  const flyingLineVertex = `
    attribute float progress;
    attribute vec3 direction;
    uniform float time;
    uniform float speed;
    uniform float fadeDistance;
    
    varying float vProgress;
    varying float vFade;
    
    void main() {
      vProgress = progress;
      
      // 计算飞行动画
      float animatedProgress = mod(progress + time * speed, 1.0);
      
      // 计算淡出效果
      float fade = 1.0;
      if (animatedProgress > 1.0 - fadeDistance) {
        fade = (1.0 - animatedProgress) / fadeDistance;
      } else if (animatedProgress < fadeDistance) {
        fade = animatedProgress / fadeDistance;
      }
      vFade = fade;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 3.0 * fade;
    }
  `;

  // 飞线的片段着色器
  const flyingLineFragment = `
    varying float vProgress;
    varying float vFade;
    uniform vec3 color;
    
    void main() {
      float alpha = vFade * 0.8;
      gl_FragColor = vec4(color, alpha);
    }
  `;

  // 端点圆心的顶点着色器
  const endPointVertex = `
    #ifdef GL_ES
    precision mediump float;
    #endif
    
    uniform float time;
    uniform float cycleTime;
    uniform float opacity;
    
    varying float vOpacity;
    
    void main() {
      // 计算循环透明度 - 简化逻辑确保可见性
      float cycle = mod(time * 0.5, cycleTime);
      float normalizedCycle = cycle / cycleTime;
      
      // 创建脉冲效果
      float pulse = sin(normalizedCycle * 6.28318) * 0.5 + 0.5;
      vOpacity = opacity * (0.3 + pulse * 0.7);
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = 12.0;
    }
  `;

  // 端点圆心的片段着色器
  const endPointFragment = `
    #ifdef GL_ES
    precision mediump float;
    #endif
    
    uniform vec3 color;
    varying float vOpacity;
    
    void main() {
      vec2 center = vec2(0.5, 0.5);
      float dist = distance(gl_PointCoord, center);
      
      if (dist > 0.5) discard;
      
      // 创建渐变圆形效果
      float alpha = (1.0 - dist * 2.0) * vOpacity;
      alpha = smoothstep(0.0, 1.0, alpha);
      
      gl_FragColor = vec4(color, alpha);
    }
  `;

  // 计算两点间的贝塞尔曲线路径
  const createCurvedPath = (start, end, segments = 50) => {
    const points = [];
    const distance = start.distanceTo(end);
    const height = Math.max(distance * 0.3, 5); // 弧线高度

    // 计算控制点（弧线的最高点）
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const controlPoint = mid
      .clone()
      .normalize()
      .multiplyScalar(20 + height);

    // 生成贝塞尔曲线点
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = new THREE.Vector3();

      // 二次贝塞尔曲线公式
      point.x =
        (1 - t) * (1 - t) * start.x +
        2 * (1 - t) * t * controlPoint.x +
        t * t * end.x;
      point.y =
        (1 - t) * (1 - t) * start.y +
        2 * (1 - t) * t * controlPoint.y +
        t * t * end.y;
      point.z =
        (1 - t) * (1 - t) * start.z +
        2 * (1 - t) * t * controlPoint.z +
        t * t * end.z;

      points.push(point);
    }

    return points;
  };

  // 从经纬度计算3D位置
  const latLonToVector3 = (lat, lon, radius = 20.2) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  // 创建端点圆心
  const createEndPoint = (position, color, cycleTime) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([position.x, position.y, position.z], 3)
    );

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        cycleTime: { value: cycleTime || 4.0 },
        opacity: { value: 1.0 },
        color: { value: color },
      },
      vertexShader: endPointVertex,
      fragmentShader: endPointFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    flyingLineMaterials.push(material);

    const point = new THREE.Points(geometry, material);
    scene.add(point);
    flyingLines.push(point);

    return point;
  };

  // 创建飞线
  const createFlyingLine = (
    startLatLon,
    endLatLon,
    color = new THREE.Vector3(0.3, 0.8, 1.0)
  ) => {
    const startPos = latLonToVector3(startLatLon.lat, startLatLon.lon);
    const endPos = latLonToVector3(endLatLon.lat, endLatLon.lon);

    const pathPoints = createCurvedPath(startPos, endPos, 60);
    const geometry = new THREE.BufferGeometry();

    const positions = [];
    const progresses = [];

    pathPoints.forEach((point, index) => {
      positions.push(point.x, point.y, point.z);
      progresses.push(index / (pathPoints.length - 1));
    });

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      "progress",
      new THREE.Float32BufferAttribute(progresses, 1)
    );

    const speed = 0.5 + Math.random() * 0.5;
    const cycleTime = 2.0 / speed; // 飞线完成一个循环的时间

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: Math.random() * 10 },
        speed: { value: speed },
        fadeDistance: { value: 0.1 },
        color: { value: color },
      },
      vertexShader: flyingLineVertex,
      fragmentShader: flyingLineFragment,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    flyingLineMaterials.push(material);

    const line = new THREE.Points(geometry, material);
    scene.add(line);
    flyingLines.push(line);

    // 创建起点和终点的圆心
    createEndPoint(startPos, color, cycleTime);
    createEndPoint(endPos, color, cycleTime);
  };

  // 添加一些示例飞线
  const routes = [
    // 北京到纽约
    {
      start: { lat: 39.9042, lon: 116.4074 },
      end: { lat: 40.7128, lon: -74.006 },
    },
    // 伦敦到东京
    {
      start: { lat: 51.5074, lon: -0.1278 },
      end: { lat: 35.6762, lon: 139.6503 },
    },
    // 悉尼到洛杉矶
    {
      start: { lat: -33.8688, lon: 151.2093 },
      end: { lat: 34.0522, lon: -118.2437 },
    },
    // 巴黎到上海
    {
      start: { lat: 48.8566, lon: 2.3522 },
      end: { lat: 31.2304, lon: 121.4737 },
    },
    // 迪拜到新加坡
    {
      start: { lat: 25.2048, lon: 55.2708 },
      end: { lat: 1.3521, lon: 103.8198 },
    },
    // 圣保罗到开普敦
    {
      start: { lat: -23.5505, lon: -46.6333 },
      end: { lat: -33.9249, lon: 18.4241 },
    },
  ];

  // 创建不同颜色的飞线
  const colors = [
    new THREE.Vector3(0.3, 0.8, 1.0), // 蓝色
    new THREE.Vector3(1.0, 0.5, 0.3), // 橙色
    new THREE.Vector3(0.5, 1.0, 0.3), // 绿色
    new THREE.Vector3(1.0, 0.3, 0.8), // 粉色
    new THREE.Vector3(0.8, 0.8, 0.3), // 黄色
    new THREE.Vector3(0.6, 0.3, 1.0), // 紫色
  ];

  routes.forEach((route, index) => {
    createFlyingLine(route.start, route.end, colors[index % colors.length]);
  });
};

const setMap = () => {
  let activeLatLon = {};
  const dotSphereRadius = 20;

  const readImageData = (imageData) => {
    for (let i = 0, lon = -180, lat = 90; i < imageData.length; i += 4, lon++) {
      if (!activeLatLon[lat]) activeLatLon[lat] = [];

      const red = imageData[i];
      const green = imageData[i + 1];
      const blue = imageData[i + 2];

      if (red < 80 && green < 80 && blue < 80) activeLatLon[lat].push(lon);

      if (lon === 180) {
        lon = -180;
        lat--;
      }
    }
  };

  const visibilityForCoordinate = (lon, lat) => {
    let visible = false;

    if (!activeLatLon[lat].length) return visible;

    const closest = activeLatLon[lat].reduce((prev, curr) => {
      return Math.abs(curr - lon) < Math.abs(prev - lon) ? curr : prev;
    });

    if (Math.abs(lon - closest) < 0.5) visible = true;

    return visible;
  };

  const calcPosFromLatLonRad = (lon, lat) => {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);

    const x = -(dotSphereRadius * Math.sin(phi) * Math.cos(theta));
    const z = dotSphereRadius * Math.sin(phi) * Math.sin(theta);
    const y = dotSphereRadius * Math.cos(phi);

    return new THREE.Vector3(x, y, z);
  };

  const createMaterial = (timeValue) => {
    const mat = material.clone();
    mat.uniforms.u_time.value = timeValue * Math.sin(Math.random());
    materials.push(mat);
    return mat;
  };

  const setDots = () => {
    const dotDensity = 2.5;
    let vector = new THREE.Vector3();

    for (let lat = 90, i = 0; lat > -90; lat--, i++) {
      const radius =
        Math.cos(Math.abs(lat) * (Math.PI / 180)) * dotSphereRadius;
      const circumference = radius * Math.PI * 2;
      const dotsForLat = circumference * dotDensity;

      for (let x = 0; x < dotsForLat; x++) {
        const long = -180 + (x * 360) / dotsForLat;

        if (!visibilityForCoordinate(long, lat)) continue;

        vector = calcPosFromLatLonRad(long, lat);

        const dotGeometry = new THREE.CircleGeometry(0.1, 5);
        dotGeometry.lookAt(vector);
        dotGeometry.translate(vector.x, vector.y, vector.z);

        const m = createMaterial(i);
        const mesh = new THREE.Mesh(dotGeometry, m);

        scene.add(mesh);
      }
    }
  };

  const image = new Image();
  image.onload = () => {
    image.needsUpdate = true;

    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = image.width;
    imageCanvas.height = image.height;

    const context = imageCanvas.getContext("2d");
    context.drawImage(image, 0, 0);

    const imageData = context.getImageData(
      0,
      0,
      imageCanvas.width,
      imageCanvas.height
    );
    readImageData(imageData.data);

    setDots();
  };

  image.src = "img/world_alpha_mini.jpg";
};

const resize = () => {
  sizes = {
    width: container.offsetWidth,
    height: container.offsetHeight,
  };

  if (window.innerWidth > 700) camera.position.z = 100;
  else camera.position.z = 140;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
};

const mousemove = (event) => {
  isIntersecting = false;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(baseMesh);
  if (intersects[0]) {
    isIntersecting = true;
    if (!grabbing) document.body.style.cursor = "pointer";
  } else {
    if (!grabbing) document.body.style.cursor = "default";
  }
};

const mousedown = () => {
  if (!isIntersecting) return;

  materials.forEach((el) => {
    gsap.to(el.uniforms.u_maxExtrusion, {
      value: 1.07,
    });
  });

  mouseDown = true;
  minMouseDownFlag = false;

  setTimeout(() => {
    minMouseDownFlag = true;
    if (!mouseDown) mouseup();
  }, 500);

  document.body.style.cursor = "grabbing";
  grabbing = true;
};

const mouseup = () => {
  mouseDown = false;
  if (!minMouseDownFlag) return;

  materials.forEach((el) => {
    gsap.to(el.uniforms.u_maxExtrusion, {
      value: 1.0,
      duration: 0.15,
    });
  });

  grabbing = false;
  if (isIntersecting) document.body.style.cursor = "pointer";
  else document.body.style.cursor = "default";
};

const listenTo = () => {
  window.addEventListener("resize", resize.bind(this));
  window.addEventListener("mousemove", mousemove.bind(this));
  window.addEventListener("mousedown", mousedown.bind(this));
  window.addEventListener("mouseup", mouseup.bind(this));
};

const render = () => {
  materials.forEach((el) => {
    el.uniforms.u_time.value += twinkleTime;
  });

  // 更新飞线和端点动画
  if (flyingLineMaterials) {
    flyingLineMaterials.forEach((material) => {
      material.uniforms.time.value += 0.01;
    });
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(render.bind(this));
};

setScene();
