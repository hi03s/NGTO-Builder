var NGTOBuilderVersion = "1.12";

var renderClass = "jp.ngt.rtm.render.VehiclePartsRenderer";
importPackage(Packages.org.lwjgl.opengl);
importPackage(Packages.org.lwjgl.input);
importPackage(Packages.jp.ngt.rtm.render);

//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil
importPackage(Packages.jp.ngt.ngtlib.renderer);//NGTRenderer GLHelper NGTRenderHelper NGTObjectRenderer
importPackage(Packages.jp.ngt.ngtlib.world);//NGTWorld

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore

//Minecraft
importPackage(Packages.net.minecraft.client.renderer.texture);//TextureMap
importPackage(Packages.net.minecraft.entity.boss);//BossStatus


var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;

var lastNGTO = new java.util.HashMap();
var loadedNGTOList = new java.util.HashMap();
var glListMap = new java.util.HashMap();
var ngtoWorld = new java.util.HashMap();

//#################
//##  Settings  ###
//#################
var rotationAngleList = [5, 15, 45, 90];//角度スナップのリスト
var defaultRotationAngle = 15;//デフォルトのスナップ角度
var renderMaxBlock = 10000;//プレビューで表示可能なブロック数の上限
var cursorMaxDistance = 512;//カーソルの限界距離
var updateProgressTime = 5;//チャットに進捗を表示する頻度(秒) 0で非表示
var KeyMaps = {//キー設定
    //オプションキー
    optionKey: Keyboard.KEY_LCONTROL,

    //スナップ角度切り替え
    changeSnapAngle: Keyboard.KEY_P,

    //向きランダム化ON/OFF
    isRandomAngle: Keyboard.KEY_O,

    //空気ブロックの設置のON/OFF
    isPlaceAirBlock: Keyboard.KEY_I,

    //プレイヤーを向く
    faceThePlayer: Keyboard.KEY_F,

    //高さ
    posUp: Keyboard.KEY_UP,
    posDown: Keyboard.KEY_DOWN,

    //回転
    rotateRight: Keyboard.KEY_RIGHT,
    rotateLeft: Keyboard.KEY_LEFT,

    //生成
    build: Keyboard.KEY_RETURN,

    //Undo
    undo: Keyboard.KEY_Z,

    //ヘルプのON/OFF
    isHideHelp: Keyboard.KEY_H,

    //終了
    endEdit: Keyboard.KEY_Q,

    //大型建築物のプレビューON/OFF
    renderHugeBuilding: Keyboard.KEY_L
}
//##  Settings END  ###

var langList = ["en_us", "ja_jp"];

function init(modelSet, modelObj) {
    ModelObj = modelObj;
    ModelSet = modelSet;

    body = renderer.registerParts(new Parts("body"));
    block = renderer.registerParts(new Parts("block"));
    cursor = renderer.registerParts(new Parts("cursor"));
    offsetYLine = renderer.registerParts(new Parts("offsetYLine"));
    offsetYLine_ground = renderer.registerParts(new Parts("offsetYLine_ground"));

    help = {};
    langList.forEach(function (lang) {
        help[lang] = [];
        for (var i = 0; i <= 1; i++) {
            help[lang][i] = renderer.registerParts(new Parts("help" + i + "_" + lang));
        }
    });
}

function render(entity, pass, par3) {
    if (pass !== 0) return;

    GL11.glPushMatrix();
    body.render(renderer);
    GL11.glPopMatrix();
    if (!entity) return;

    var dataMap = entity.getResourceState().getDataMap();
    var isOpenGUI = NGTUtilClient.getMinecraft().field_71462_r !== null;
    var world = entity.field_70170_p;
    var posX = MCWrapper.getPosX(entity);
    var posY = MCWrapper.getPosY(entity);
    var posZ = MCWrapper.getPosZ(entity);
    var offsetY = dataMap.getInt("offsetY");
    var offsetYaw = dataMap.getInt("offsetYaw");
    var additionalYaw = dataMap.getInt("additionalYaw");
    var player = MCWrapperClient.getPlayer();
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    var lookingBlockPos = getLookingPos();
    var VERSIONS_server = dataMap.getString("VERSIONS");
    if (VERSIONS_server === "") VERSIONS_server = "~ 1.3";
    var isVersionChecked = dataMap.getBoolean("isVersionChecked");
    var isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");
    var isHideHelp = dataMap.getBoolean("isHideHelp");
    var isRenderHugeBuilding = dataMap.getBoolean("isRenderHugeBuilding");
    var currentTime = Math.floor(renderer.getSystemTimeMillis() / 1000);//sec
    var startTime = dataMap.getInt("startTime");
    var maxBlockCount = dataMap.getInt("maxBlockCount");

    doFollowing(entity, hostPlayer);//1.12用

    if (hostPlayer && hostPlayer === player) {
        //バージョンチェック
        if ((VERSIONS_server != NGTOBuilderVersion) && !isVersionChecked) {
            dataMap.setBoolean("isVersionChecked", true, 0);
            NGTLog.sendChatMessage(hostPlayer, "§c[NGTO Builder]Versions don't match!");
            NGTLog.sendChatMessage(hostPlayer, "§cClient:" + NGTOBuilderVersion);
            NGTLog.sendChatMessage(hostPlayer, "§cServer:" + VERSIONS_server);
        }

        var currentItem = getSelectedSlotItem(player);
        var isBuilding = dataMap.getBoolean("isBuilding");
        var isUndo = dataMap.getBoolean("isUndo");
        var isChangeRotation = false;

        var rotationAngle = dataMap.getInt("rotationAngle");
        if (rotationAngle === 0) {
            rotationAngle = defaultRotationAngle;
            dataMap.setInt("rotationAngle", rotationAngle, 0);
        }

        //プレイヤー操作
        if (!isOpenGUI && !isBuilding && !isUndo) {
            var isKeyDown_optionKey = Keyboard.isKeyDown(KeyMaps.optionKey);
            //回転角度切り替え
            var prevInputKey_changeAngle = dataMap.getBoolean("prevInputKey_changeAngle");
            var isKeyDown_changeAngle = Keyboard.isKeyDown(KeyMaps.changeSnapAngle);
            if (!prevInputKey_changeAngle) {
                if (isKeyDown_changeAngle) {
                    dataMap.setBoolean("prevInputKey_changeAngle", true, 0);
                    var currentAngleIndex = rotationAngleList.indexOf(rotationAngle);
                    var newAngleIndex = (currentAngleIndex + 1) % rotationAngleList.length;
                    rotationAngle = rotationAngleList[newAngleIndex];
                    dataMap.setInt("rotationAngle", rotationAngle, 0);
                    NGTLog.sendChatMessage(player, "Rotation angle : " + rotationAngle);
                    var newAngle = Math.round(offsetYaw / rotationAngle) * rotationAngle;
                    offsetYaw = newAngle;
                    dataMap.setInt("offsetYaw", offsetYaw, 0);
                    isChangeRotation = true;
                }
            }
            else if (!isKeyDown_changeAngle) dataMap.setBoolean("prevInputKey_changeAngle", false, 0);

            //大型建築物のプレビューON/OFF
            var isKeyDown_renderHugeBuilding = Keyboard.isKeyDown(KeyMaps.renderHugeBuilding);
            var prevInputKey_renderHugeBuilding = dataMap.getBoolean("prevInputKey_renderHugeBuilding");
            if (isKeyDown_renderHugeBuilding && !prevInputKey_renderHugeBuilding) {
                dataMap.setBoolean("prevInputKey_renderHugeBuilding", true, 0);
                isRenderHugeBuilding = !isRenderHugeBuilding;
                dataMap.setBoolean("isRenderHugeBuilding", isRenderHugeBuilding, 1);
                NGTLog.sendChatMessage(player, "Preview huge building:" + isRenderHugeBuilding);
                isChangeRotation = true;
            }
            if (!isKeyDown_renderHugeBuilding && prevInputKey_renderHugeBuilding) {
                dataMap.setBoolean("prevInputKey_renderHugeBuilding", false, 0);
            }

            //向きランダム化ON/OFF
            var prevInputKey_isRandomAngle = dataMap.getBoolean("prevInputKey_isRandomAngle");
            var isKeyDown_isRandomAngle = Keyboard.isKeyDown(KeyMaps.isRandomAngle);
            var isRandomAngle = dataMap.getBoolean("isRandomAngle");
            if (!prevInputKey_isRandomAngle) {
                if (isKeyDown_isRandomAngle) {
                    dataMap.setBoolean("prevInputKey_isRandomAngle", true, 0);
                    dataMap.setBoolean("isRandomAngle", !isRandomAngle, 0);
                    NGTLog.sendChatMessage(player, "Random rotation: " + (!isRandomAngle));
                }
            }
            else if (!isKeyDown_isRandomAngle) dataMap.setBoolean("prevInputKey_isRandomAngle", false, 0);
            if (isRandomAngle && lookingBlockPos) {
                var posString = "" + lookingBlockPos.x + lookingBlockPos.y + lookingBlockPos.z;
                var prevPosString = dataMap.getString("prevPosString");
                if (posString !== prevPosString) {
                    dataMap.setString("prevPosString", posString, 0);
                    var randomAngle = Math.round(Math.random() * 360 / rotationAngle) * rotationAngle;
                    offsetYaw = randomAngle;
                    dataMap.setInt("offsetYaw", offsetYaw, 0);
                    isChangeRotation = true;
                }
            }

            //空気設置ON/OFF
            var isKeyDown_isPlaceAirBlock = Keyboard.isKeyDown(KeyMaps.isPlaceAirBlock);
            var prevInputKey_isPlaceAirBlock = dataMap.getBoolean("prevInputKey_isPlaceAirBlock");
            if (isKeyDown_isPlaceAirBlock && !prevInputKey_isPlaceAirBlock) {
                dataMap.setBoolean("prevInputKey_isPlaceAirBlock", true, 0);
                isPlaceAirBlock = !isPlaceAirBlock;
                dataMap.setBoolean("isPlaceAirBlock", isPlaceAirBlock, 1);
                NGTLog.sendChatMessage(player, "isPlaceAirBlock:" + isPlaceAirBlock);
                isChangeRotation = true;
            }
            if (!isKeyDown_isPlaceAirBlock && prevInputKey_isPlaceAirBlock) {
                dataMap.setBoolean("prevInputKey_isPlaceAirBlock", false, 0);
            }

            //ヘルプ非表示
            var isKeyDown_isHideHelp = Keyboard.isKeyDown(KeyMaps.isHideHelp);
            var prevInputKey_isHideHelp = dataMap.getBoolean("prevInputKey_isHideHelp");
            if (isKeyDown_isHideHelp && !prevInputKey_isHideHelp) {
                dataMap.setBoolean("prevInputKey_isHideHelp", true, 0);
                isHideHelp = !isHideHelp;
                dataMap.setBoolean("isHideHelp", isHideHelp, 1);
            }
            if (!isKeyDown_isHideHelp && prevInputKey_isHideHelp) {
                dataMap.setBoolean("prevInputKey_isHideHelp", false, 0);
            }

            //高さ
            var prevInputKey_offsetY = dataMap.getBoolean("prevInputKey_offsetY");
            var isKeyDown_offsetYUp = Keyboard.isKeyDown(KeyMaps.posUp);
            var isKeyDown_offsetYDown = Keyboard.isKeyDown(KeyMaps.posDown);
            if (!prevInputKey_offsetY) {
                if (isKeyDown_offsetYUp) {
                    offsetY++;
                    dataMap.setBoolean("prevInputKey_offsetY", true, 0);
                    dataMap.setInt("offsetY", offsetY, 0);
                }
                if (isKeyDown_offsetYDown) {
                    offsetY--;
                    dataMap.setBoolean("prevInputKey_offsetY", true, 0);
                    dataMap.setInt("offsetY", offsetY, 0);
                }
            }
            if (!isKeyDown_offsetYUp && !isKeyDown_offsetYDown) dataMap.setBoolean("prevInputKey_offsetY", false, 0);

            //プレイヤーの方を向く
            var isKeyDown_faceThePlayer = Keyboard.isKeyDown(KeyMaps.faceThePlayer);
            var prevInputKey_faceThePlayer = dataMap.getBoolean("prevInputKey_faceThePlayer");
            if (isKeyDown_faceThePlayer && !prevInputKey_faceThePlayer && lookingBlockPos) {
                dataMap.setBoolean("prevInputKey_faceThePlayer", true, 0);
                var toPlayerVec = new Vec3(posX - lookingBlockPos.x, 0, posZ - lookingBlockPos.z);
                var newAngle = Math.round(toPlayerVec.getYaw() / rotationAngle) * rotationAngle;
                offsetYaw = newAngle + additionalYaw;
                dataMap.setInt("offsetYaw", offsetYaw, 0);
                isChangeRotation = true;
            }
            if (!isKeyDown_faceThePlayer && prevInputKey_faceThePlayer) {
                dataMap.setBoolean("prevInputKey_faceThePlayer", false, 0);
            }

            //回転
            var prevInputKey_offsetYaw = dataMap.getBoolean("prevInputKey_offsetYaw");
            var isKeyDown_turnRight = Keyboard.isKeyDown(KeyMaps.rotateRight);
            var isKeyDown_turnLeft = Keyboard.isKeyDown(KeyMaps.rotateLeft);
            if (!prevInputKey_offsetYaw) {
                if (isKeyDown_optionKey) {
                    //90度回転
                    if (isKeyDown_turnLeft) {
                        offsetYaw = (offsetYaw + 90) % 360;
                        dataMap.setBoolean("prevInputKey_offsetYaw", true, 0);
                        dataMap.setInt("offsetYaw", offsetYaw, 0);
                        dataMap.setInt("additionalYaw", additionalYaw + 90, 0);
                        isChangeRotation = true;
                    }
                    if (isKeyDown_turnRight) {
                        offsetYaw = offsetYaw - 90;
                        if (offsetYaw < 0) offsetYaw += 360;
                        dataMap.setBoolean("prevInputKey_offsetYaw", true, 0);
                        dataMap.setInt("offsetYaw", offsetYaw, 0);
                        dataMap.setInt("additionalYaw", additionalYaw - 90, 0);
                        isChangeRotation = true;
                    }
                }
                else {
                    //スナップ回転
                    if (isKeyDown_turnLeft) {
                        offsetYaw = (offsetYaw + rotationAngle) % 360;
                        dataMap.setBoolean("prevInputKey_offsetYaw", true, 0);
                        dataMap.setInt("offsetYaw", offsetYaw, 0);
                        isChangeRotation = true;
                    }
                    if (isKeyDown_turnRight) {
                        offsetYaw = offsetYaw - rotationAngle;
                        if (offsetYaw < 0) offsetYaw += 360;
                        dataMap.setBoolean("prevInputKey_offsetYaw", true, 0);
                        dataMap.setInt("offsetYaw", offsetYaw, 0);
                        isChangeRotation = true;
                    }
                }
            }
            if (!isKeyDown_turnRight && !isKeyDown_turnLeft) dataMap.setBoolean("prevInputKey_offsetYaw", false, 0);

            //生成
            var isKeyDown_build = Keyboard.isKeyDown(KeyMaps.build);
            if (isKeyDown_build && currentItem && lookingBlockPos) {
                var nbt = currentItem.func_77978_p();
                //手持ちのアイテムがNGTO指定済みミニチュアブロックか判別する
                if (nbt && nbt.func_74764_b("BlocksData")) {
                    var buildPosData = [
                        lookingBlockPos.x,
                        lookingBlockPos.y + offsetY,
                        lookingBlockPos.z,
                        offsetYaw
                    ]
                    dataMap.setBoolean("isBuilding", true, 1);
                    dataMap.setString("buildPosData", JSON.stringify(buildPosData).replace(/,/g, "☆"), 1);
                    dataMap.setInt("startTime", currentTime, 0);
                    startTime = currentTime;
                }
            }

            //undo
            if (isKeyDown_optionKey && Keyboard.isKeyDown(KeyMaps.undo)) {
                dataMap.setBoolean("isUndo", true, 1);
            }

            //終了
            if (Keyboard.isKeyDown(KeyMaps.endEdit)) {
                dataMap.setBoolean("isEndEdit", true, 1);
            }
        }
        if (isBuilding) {
            if (dataMap.getBoolean("buildComplete")) {//生成完了
                dataMap.setBoolean("isBuilding", false, 1);
                dataMap.setBoolean("buildComplete", false, 1);
                if (dataMap.getBoolean("showCompleteMessage")) {
                    dataMap.setBoolean("showCompleteMessage", false, 0);
                    NGTLog.sendChatMessage(player, "[NGTO Builder]: Completed!");
                }
            }
        }
        if (isUndo) {
            if (dataMap.getBoolean("buildComplete")) {//生成完了
                dataMap.setBoolean("isUndo", false, 1);
                dataMap.setBoolean("buildComplete", false, 1);
                dataMap.setBoolean("showCompleteMessage", false, 0);
            }
        }

        //ヘルプ表示
        if (lookingBlockPos) {
            var toPlayerVec = new Vec3(lookingBlockPos.posX - posX, lookingBlockPos.posY - posY, lookingBlockPos.posZ - posZ);
            var lang = NGTUtilClient.getMinecraft().func_135016_M().func_135041_c().func_135034_a().toLowerCase();
            if (langList.indexOf(lang) === -1) lang = langList[0];
            var renderHelp = function (index) {
                GL11.glPushMatrix();
                GL11.glTranslatef(lookingBlockPos.posX, lookingBlockPos.posY, lookingBlockPos.posZ);
                GL11.glTranslatef(-posX, -posY, -posZ);
                GL11.glRotatef(toPlayerVec.getYaw() + 180, 0, 1, 0);
                GL11.glRotatef(toPlayerVec.getPitch(), 1, 0, 0);
                help[lang][index].render(renderer);
                GL11.glPopMatrix();
            }
            if (isHideHelp) {
                renderHelp(0);
            }
            else {
                renderHelp(1);
            }
        }

        //カーソル描画
        if (lookingBlockPos) {
            GL11.glPushMatrix();
            GL11.glTranslatef(lookingBlockPos.x, lookingBlockPos.y + offsetY, lookingBlockPos.z);
            GL11.glTranslatef(-posX, -posY, -posZ);
            cursor.render(renderer);
            //オフセット線描画
            for (var i = 0; i < offsetY; i++) {
                GL11.glPushMatrix();
                GL11.glTranslatef(0, -offsetY + i, 0);
                if (i === 0) offsetYLine_ground.render(renderer);
                else offsetYLine.render(renderer);
                GL11.glPopMatrix();
            }
            GL11.glPopMatrix();
        }

        //進捗を表示
        if (isBuilding && updateProgressTime !== 0 && maxBlockCount !== 0) {
            var prevTime = dataMap.getInt("prevTime");
            if (prevTime !== currentTime) {
                dataMap.setInt("prevTime", currentTime, 0);
                if ((currentTime - startTime) % updateProgressTime === 2) {
                    var remBlockCount = dataMap.getInt("remBlockCount");
                    var putCount = maxBlockCount - remBlockCount;
                    NGTLog.sendChatMessage(player, "[NGTO Builder]: Building... " + Math.floor((putCount / maxBlockCount) * 100) + "%%");
                    dataMap.setBoolean("showCompleteMessage", true, 0);
                }
            }
        }

        //ブロック描画
        if (currentItem && lookingBlockPos && !isBuilding && !isUndo) {
            var nbt = currentItem.func_77978_p();
            if (nbt && nbt.func_74764_b("BlocksData")) {

                //ItemMiniature.getNGTObjectは取得だけでもメモリを消費するため、HashMapになければ都度取得するようにする
                var ngto = loadedNGTOList.get(nbt);
                if (!ngto) {
                    ngto = ItemMiniature.getNGTObject(nbt);
                    loadedNGTOList.put(nbt, ngto);
                }

                var glList = glListMap.get(entity);
                //glListを更新する場合は描画データをコンパイルする
                if (lastNGTO.get(entity) !== ngto || !glList || isChangeRotation) {
                    if (!glList) {
                        glList = isOldVer ? GLHelper.generateGLList() : GLHelper.generateGLList(null);
                        glListMap.put(entity, glList);
                    }
                    lastNGTO.put(entity, ngto);

                    var blockSetList = getRotatableBlockSetList(ngto, isPlaceAirBlock);//ブロックフレームの座標リスト
                    var isHugeBuilding = false;
                    if (blockSetList.length > renderMaxBlock) {
                        blockSetList = getFrameBlockList(ngto);//巨大NGTO外側のフレームのみ表示
                        isHugeBuilding = true;
                    }
                    var rotateBlockSetList = rotationBlockSetList(blockSetList, 0, 0, 0, offsetYaw);//回転後の座標リスト

                    GL11.glPushMatrix();
                    GLHelper.startCompile(glList);

                    //ブロックフレーム
                    for (var blockIdx = 0; blockIdx < rotateBlockSetList.length; blockIdx++) {
                        var renderBlockPos = rotateBlockSetList[blockIdx];
                        GL11.glPushMatrix();
                        GL11.glTranslatef(Math.round(renderBlockPos[1]), renderBlockPos[2], Math.round(renderBlockPos[3]));//serBlockと仕様を合わせるためfloor + 0.5
                        renderStatic(block);
                        GL11.glPopMatrix();
                    }

                    //NGTOモデル
                    if (!isHugeBuilding || isRenderHugeBuilding) {
                        //var axisVec = new Vec3(-0.5, 0, -0.5);
                        //axisVec = axisVec.rotateAroundY(offsetYaw);
                        GL11.glPushMatrix();
                        GL11.glTranslatef(0, 0.01, 0);
                        GL11.glRotatef(offsetYaw, 0, 1, 0);
                        GL11.glTranslatef(0.5, -0.5, 0.5);
                        GL11.glTranslatef(Math.floor(-ngto.xSize / 2), 0, Math.floor(-ngto.zSize / 2));
                        renderer.bindTexture(TextureMap.field_110575_b);
                        renderNGTO(ngto, pass);
                        GL11.glPopMatrix();
                    }

                    GLHelper.endCompile();
                    GL11.glPopMatrix();
                }
                else {//更新がなければコンパイル済みの描画データを使用する
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.x, lookingBlockPos.y + offsetY, lookingBlockPos.z);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    GLHelper.callList(glList);
                    GL11.glPopMatrix();
                }
            }
        }
    }
}

//####  関数  ####
//# クライアントサイド #
function getLookingPos() {
    var pos = null;
    var player = MCWrapperClient.getPlayer();
    var mop = BlockUtil.getMOPFromPlayer(player, cursorMaxDistance, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;
        if (isOldVer) {
            pos = {
                x: mop.field_72311_b + 0.5,
                y: mop.field_72312_c + 0.5,
                z: mop.field_72309_d + 0.5,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
        else {
            var blockPos = mop.func_178782_a();
            pos = {
                x: blockPos.func_177958_n() + 0.5,
                y: blockPos.func_177956_o() + 0.5,
                z: blockPos.func_177952_p() + 0.5,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
    }
    return pos;
}

function renderNGTO(ngto, pass) {
    if (isOldVer) {
        NGTRenderer.renderNGTObject(ngto, true);
    }
    else {
        var world = ngtoWorld.get(ngto);
        if (!world) {
            world = new NGTWorld(NGTUtil.getClientWorld(), ngto);
            ngtoWorld.put(ngto, world);
        }
        NGTObjectRenderer.INSTANCE.renderNGTObject(world, ngto, true, 0, pass);
    }
}

function getFrameBlockList(ngto) {
    var blockSetList = [];
    var centerX = ngto.xSize / 2;
    var centerZ = ngto.zSize / 2;

    var maxX = ngto.xSize - 1;
    var maxY = ngto.ySize - 1;
    var maxZ = ngto.zSize - 1;

    var yzList = [[0, 0], [0, maxZ], [maxY, 0], [maxY, maxZ]];
    for (var xIdx = 0; xIdx < ngto.xSize; xIdx++) {
        yzList.forEach(function (posYZ) {
            var blockSet = ngto.getBlockSet(xIdx, posYZ[0], posYZ[1]);
            var rotatableBlockSet = new RotatableBlockSet(blockSet, xIdx, posYZ[0], posYZ[1]);
            rotatableBlockSet.setAxisPos(centerX, 0, centerZ);
            blockSetList.push(rotatableBlockSet);
        });
    }

    var xyList = [[0, 0], [maxX, 0], [0, maxY], [maxX, maxY]];
    for (var zIdx = 0; zIdx < ngto.zSize; zIdx++) {
        xyList.forEach(function (posXY) {
            var blockSet = ngto.getBlockSet(posXY[0], posXY[1], zIdx);
            var rotatableBlockSet = new RotatableBlockSet(blockSet, posXY[0], posXY[1], zIdx);
            rotatableBlockSet.setAxisPos(centerX, 0, centerZ);
            blockSetList.push(rotatableBlockSet);
        });
    }

    var xzList = [[0, 0], [maxX, 0], [0, maxZ], [maxX, maxZ]];
    for (var yIdx = 0; yIdx < ngto.ySize; yIdx++) {
        xzList.forEach(function (posXZ) {
            var blockSet = ngto.getBlockSet(posXZ[0], yIdx, posXZ[1]);
            var rotatableBlockSet = new RotatableBlockSet(blockSet, posXZ[0], yIdx, posXZ[1]);
            rotatableBlockSet.setAxisPos(centerX, 0, centerZ);
            blockSetList.push(rotatableBlockSet);
        });
    }

    return blockSetList;
}

//ディスプレイリストを利用して描画する場合はこの関数が必要
//ModelObj、ModelSetをinitで定義しておくこと
function renderStatic(Parts) {
    NGTRenderHelper.renderCustomModel(ModelObj.model, renderer.currentMatId, ModelSet.getConfig().smoothing, Parts.objNames);
}

//# 共通 #
function hasTileEntity(blockSet) {
    if (!blockSet || !blockSet.block) return false;

    var block = blockSet.block;
    try {
        if (block instanceof Packages.net.minecraft.block.ITileEntityProvider) return true;

        if (isOldVer) return block.hasTileEntity(blockSet.metadata);
        else return block.hasTileEntity(block.func_176203_a(blockSet.metadata));
    }
    catch (err) {
        NGTLog.debug("[NGTO Builder] hasTileEntity Error: " + block + " -> " + err);
        return false;
    }
}

function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function doFollowing(entity, hostPlayer) {
    if (!entity || !hostPlayer || isOldVer) return;
    var x = hostPlayer.field_70165_t;
    var y = hostPlayer.field_70163_u + 2;
    var z = hostPlayer.field_70161_v;

    entity.func_70107_b(x, y, z);

    entity.field_70159_w = 0;
    entity.field_70181_x = 0;
    entity.field_70179_y = 0;
}

//blockSetList = [RotatableBlockSet, ...]
function getRotatableBlockSetList(ngto, isPlaceAirBlock) {//Y軸方向に下から作る
    var blockSetList = [];
    var centerX = ngto.xSize / 2;
    var centerZ = ngto.zSize / 2;
    var isEvenSizeX = ngto.xSize % 2 === 0;
    var isEvenSizeZ = ngto.zSize % 2 === 0;
    for (var yIdx = 0; yIdx < ngto.ySize; yIdx++) {
        for (var xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (var zIdx = 0; zIdx < ngto.zSize; zIdx++) {
                var blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                if (isPlaceAirBlock || Packages.net.minecraft.block.Block.func_149682_b(blockSet.block) !== 0) {//空気は除外
                    var posX = isEvenSizeX ? xIdx + 0.5 : xIdx;
                    var posZ = isEvenSizeZ ? zIdx + 0.5 : zIdx;
                    var rotatableBlockSet = new RotatableBlockSet(blockSet, posX, yIdx, posZ);
                    rotatableBlockSet.setAxisPos(centerX, 0, centerZ);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
    }
    return blockSetList;
}

//[[BlockSet, x, y, z],...]
function rotationBlockSetList(blockSetList, x, y, z, yaw) {
    yaw = Math.round(yaw);
    var newBlockSetList = [];
    var addedPosHashSet = new java.util.HashSet();
    for (var i = 0; i < blockSetList.length; i++) {
        var rotatableBlockSet = blockSetList[i];
        var blockSet = rotatableBlockSet.blockSet;
        var pos = rotatableBlockSet.getRotationPos(x, y, z, yaw, 0);
        var pos_string = [Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)].join(",");
        if (addedPosHashSet.add(pos_string)) {
            newBlockSetList.push([blockSet, Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)]);
            //補完処理
            if (!hasTileEntity(blockSet) && yaw !== 0 && yaw !== 90 && yaw !== 180 && yaw !== 270) {
                var offset = 0.333;
                var offsetList = [
                    [offset, offset], [0, offset], [-offset, offset],
                    [offset, 0], [-offset, 0],
                    [offset, -offset], [0, -offset], [-offset, -offset]
                ];
                offsetList.forEach(function (offset) {
                    var offsetX = pos.x + offset[0];
                    var offsetZ = pos.z + offset[1];
                    var offsetPos_string = [Math.floor(offsetX), Math.floor(pos.y), Math.floor(offsetZ)].join(",");
                    if (Math.floor(pos.x) !== Math.floor(offsetX) || Math.floor(pos.z) !== Math.floor(offsetZ)) {
                        if (addedPosHashSet.add(offsetPos_string)) {
                            newBlockSetList.push([blockSet, Math.floor(offsetX), Math.floor(pos.y), Math.floor(offsetZ)]);
                        }
                    }
                });
            }
        }
    }
    return newBlockSetList;
}

//###  回転ブロック擬似クラス  ###
function RotatableBlockSet(blockSet, localX, localY, localZ) {
    this.blockSet = blockSet;
    this.local_x = localX + 0.5;
    this.local_y = localY;
    this.local_z = localZ + 0.5;
    this.axis_x = 0;
    this.axis_y = 0;
    this.axis_z = 0;
}

RotatableBlockSet.prototype = {
    setAxisPos: function (x, y, z) {
        this.axis_x = x;
        this.axis_y = y;
        this.axis_z = z;
    },
    getRotationPos: function (x, y, z, yaw, pitch) {
        var vec = new Vec3(this.local_x - this.axis_x, this.local_y - this.axis_y, this.local_z - this.axis_z);
        //vec = vec.rotateAroundY(90);
        vec = vec.rotateAroundZ(pitch);
        vec = vec.rotateAroundY(yaw);
        return {
            x: x + vec.getX(),
            y: y + vec.getY(),
            z: z + vec.getZ()
        }
    }
};