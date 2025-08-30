var NGTOBuilderVersion = "1.12";

var renderClass = "jp.ngt.rtm.render.VehiclePartsRenderer";
importPackage(Packages.org.lwjgl.opengl);
importPackage(Packages.org.lwjgl.input);
importPackage(Packages.jp.ngt.rtm.render);

//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore RTMItem
importPackage(Packages.jp.ngt.rtm.item);//ItemInstalledObject
importPackage(Packages.jp.ngt.rtm.rail);//TileEntityLargeRailBase
importPackage(Packages.jp.ngt.rtm.electric);//TileEntityInsulator

//Minecraft
importPackage(Packages.net.minecraft.util);//EnumFacing


var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
var ignoreItemList = [RTMItem.itemWire, RTMItem.installedObject];


//#################
//##  Settings  ###
//#################
var cursorMaxDistance = 512;//カーソルの限界距離
//キー設定
var KeyMaps = {
    //オプションキー
    optionKey: Keyboard.KEY_LCONTROL,
    
    //マーカーを固定
    markerFix: Keyboard.KEY_RETURN,

    //マーカー全削除
    allDelete: Keyboard.KEY_C,

    //終了
    endEdit: Keyboard.KEY_Q,

    //円形表示を切り替える
    changeDisplay: Keyboard.KEY_P,

    //選択ロックのON/OFF
    selectLock: Keyboard.KEY_L
}
//##  Settings END  ###

var langList = ["en_us", "ja_jp"];

function init(par1, par2) {
    body = renderer.registerParts(new Parts("body"));
    body2 = renderer.registerParts(new Parts("body2"));
    line = renderer.registerParts(new Parts("line"));
    lock = renderer.registerParts(new Parts("lock"));
    scale1 = renderer.registerParts(new Parts("scale1"));
    scale10 = renderer.registerParts(new Parts("scale10"));
    point = renderer.registerParts(new Parts("point"));
    cursor = renderer.registerParts(new Parts("cursor"));
    circle = renderer.registerParts(new Parts("circle"));
    sel_line = renderer.registerParts(new Parts("sel_line"));
    sel_scale1 = renderer.registerParts(new Parts("sel_scale1"));
    sel_scale10 = renderer.registerParts(new Parts("sel_scale10"));

    strObj = [];
    for (var i = 0; i <= 9; i++) {
        strObj[i] = renderer.registerParts(new Parts("str_" + i));
    }
    str_decimal = renderer.registerParts(new Parts("str_decimal"));
    str_angle = renderer.registerParts(new Parts("str_angle"));
    str_sum = renderer.registerParts(new Parts("str_sum"));
    str_len = renderer.registerParts(new Parts("str_len"));
    str_colon = renderer.registerParts(new Parts("str_colon"));

    help = {};
    langList.forEach(function (lang) {
        help[lang] = [];
        for (var i = 0; i <= 1; i++) {
            help[lang][i] = renderer.registerParts(new Parts("help" + i + "_" + lang));
        }
    });
}

function render(entity, pass, par3) {
    if (!entity) {
        GL11.glPushMatrix();
        body.render(renderer);
        GL11.glPopMatrix();
        return;
    };

    var dataMap = entity.getResourceState().getDataMap();
    var isOpenGUI = NGTUtilClient.getMinecraft().field_71462_r !== null;
    var world = entity.field_70170_p;
    var posX = MCWrapper.getPosX(entity);
    var posY = MCWrapper.getPosY(entity);
    var posZ = MCWrapper.getPosZ(entity);
    //var yaw = MCWrapper.getYaw(entity); //yawはサーバー側で0に固定
    var player = MCWrapperClient.getPlayer();
    var lookingBlockPos = getLookingPos(world, 0, false);
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    var isLeftClick = Mouse.isButtonDown(0);
    var isRightClick = Mouse.isButtonDown(1);
    var isSelectLock = dataMap.getBoolean("selectLock");
    if (isSelectLock){
        isLeftClick = false;
        isRightClick = false;
    }
    var VERSIONS_server = dataMap.getString("VERSIONS");
    if (VERSIONS_server === "") VERSIONS_server = "~ 1.3";
    var isVersionChecked = dataMap.getBoolean("isVersionChecked");
    var isHideHelp = dataMap.getBoolean("isHideHelp");
    var changeDisplay = dataMap.getBoolean("changeDisplay");
    var selectPosList = [];
    var selectPosList_JSON = dataMap.getString("selectPosList").replace(/☆/g, ",");
    if (selectPosList_JSON !== "") selectPosList = JSON.parse(selectPosList_JSON);

    doFollowing(entity, hostPlayer);//1.12用

    if (hostPlayer === player) {
        if (pass !== 0) return;

        GL11.glPushMatrix();
        body.render(renderer);
        GL11.glPopMatrix();

        //バージョンチェック
        if ((VERSIONS_server != NGTOBuilderVersion) && !isVersionChecked) {
            dataMap.setBoolean("isVersionChecked", true, 0);
            NGTLog.sendChatMessage(hostPlayer, "§c[NGTO Builder]Versions don't match!");
            NGTLog.sendChatMessage(hostPlayer, "§cClient:" + NGTOBuilderVersion);
            NGTLog.sendChatMessage(hostPlayer, "§cServer:" + VERSIONS_server);
        }

        //操作プレイヤー
        if (hostPlayer === player) {
            //キー入力関連操作
            var prevIsClick = dataMap.getBoolean("prevIsClick");
            if (!prevIsClick && (isLeftClick || isRightClick)) dataMap.setBoolean("prevIsClick", true, 0);
            if (prevIsClick && !isLeftClick && !isRightClick) dataMap.setBoolean("prevIsClick", false, 0);
            if (!isOpenGUI) {
                
                //水平指定機能
                if (Keyboard.isKeyDown(KeyMaps.optionKey) && lookingBlockPos && selectPosList.length > 0){
                    var lastPosY = selectPosList[selectPosList.length - 1][1];
                    lookingBlockPos.posY = lastPosY;
                }

                //選択ロック
                var isKeyDown_selectLock = Keyboard.isKeyDown(KeyMaps.selectLock);
                var prevInputKey_selectLock = dataMap.getBoolean("prevInputKey_selectLock");
                if (isKeyDown_selectLock && !prevInputKey_selectLock) {
                    dataMap.setBoolean("prevInputKey_selectLock", true, 0);
                    isSelectLock = !isSelectLock;
                    dataMap.setBoolean("selectLock", isSelectLock, 1);
                    NGTLog.sendChatMessage(player, "Select lock:" + isSelectLock);
                }
                if (!isKeyDown_selectLock && prevInputKey_selectLock) {
                    dataMap.setBoolean("prevInputKey_selectLock", false, 0);
                }

                //座標指定
                if (lookingBlockPos && !prevIsClick) {
                    //右クリック ポイント追加
                    if (isRightClick) {
                        var lastPos = selectPosList[selectPosList.length - 1];
                        var vecPosX = lookingBlockPos.posX;
                        var vecPosY = lookingBlockPos.posY;
                        var vecPosZ = lookingBlockPos.posZ;
                        if (selectPosList.length > 0 && lastPos[0] == vecPosX && lastPos[1] == vecPosY && lastPos[2] == vecPosZ) {
                            NGTLog.sendChatMessage(player, "This coordinate can't be added");
                        }
                        else {
                            selectPosList.push([vecPosX, vecPosY, vecPosZ]);
                        }
                    }
                    //左クリック ポイント削除
                    if (isLeftClick) {
                        if (selectPosList.length > 0) selectPosList.pop();
                    }
                    //データ変更
                    if ((isRightClick || isLeftClick)) {
                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                        dataMap.setString("selectPosList", selectPosList_JSON, 3);
                    }
                }

                //選択を削除
                if (Keyboard.isKeyDown(KeyMaps.allDelete) && !isSelectLock) {
                    selectPosList = [];
                    selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                    dataMap.setString("selectPosList", selectPosList_JSON, 3);
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

                //円形表示
                var isKeyDown_changeDisplay = Keyboard.isKeyDown(KeyMaps.changeDisplay);
                var prevInputKey_changeDisplay = dataMap.getBoolean("prevInputKey_changeDisplay");
                if (isKeyDown_changeDisplay && !prevInputKey_changeDisplay) {
                    dataMap.setBoolean("prevInputKey_changeDisplay", true, 0);
                    changeDisplay = !changeDisplay;
                    dataMap.setBoolean("changeDisplay", changeDisplay, 3);
                    NGTLog.sendChatMessage(player, "Show Circle: " + changeDisplay);
                }
                if (!isKeyDown_changeDisplay && prevInputKey_changeDisplay) {
                    dataMap.setBoolean("prevInputKey_changeDisplay", false, 0);
                }

                //マーカー固定
                if (Keyboard.isKeyDown(KeyMaps.markerFix) && !isSelectLock) {
                    dataMap.setString("hostPlayerEntityId", "", 3);
                }

                //終了
                if (Keyboard.isKeyDown(KeyMaps.endEdit) && !isSelectLock) {
                    dataMap.setBoolean("isEndEdit", true, 1);
                }
            }

            //カーソル描画
            if (lookingBlockPos) {
                //カーソル
                GL11.glPushMatrix();
                var renderCursorPos = [lookingBlockPos.posX, lookingBlockPos.posY, lookingBlockPos.posZ];
                GL11.glTranslatef(renderCursorPos[0], renderCursorPos[1], renderCursorPos[2]);
                GL11.glTranslatef(-posX, -posY, -posZ);
                cursor.render(renderer);
                if (isSelectLock) lock.render(renderer);
                GL11.glPopMatrix();

                //カーソルライン描画
                if (selectPosList.length > 0) {
                    var currentPos = selectPosList[selectPosList.length - 1];
                    var nextPos = renderCursorPos;
                    renderScaleLine(currentPos, nextPos, false, posX, posY, posZ, line, scale1, scale10, false);
                }

                //角度描画
                if (selectPosList.length > 1) {
                    var prevPos = selectPosList[selectPosList.length - 2]
                    var currentPos = selectPosList[selectPosList.length - 1];
                    var nextPos = renderCursorPos;
                    renderLineAngle(prevPos, currentPos, nextPos, posX, posY, posZ)
                }

                //円形表示
                if (changeDisplay && selectPosList.length > 0) {
                    var currentPos = selectPosList[0];
                    var nextPos = selectPosList.length === 1 ? renderCursorPos : selectPosList[1];
                    renderCircle(currentPos, nextPos, posX, posY, posZ);
                }
            }

            //指定ポイント・線描画
            if (selectPosList.length > 0) {
                for (var i = 0; i < selectPosList.length - 1; i++) {
                    var currentPos = selectPosList[i];
                    var nextPos = selectPosList[i + 1];
                    renderScaleLine(currentPos, nextPos, true, posX, posY, posZ, sel_line, sel_scale1, sel_scale10, false);
                }
            }
        }
    }
    else {
        //指定ポイント・線描画
        if (selectPosList.length > 0) {
            //設置(半透明)
            if (pass === 1) {
                GL11.glPushMatrix();
                body2.render(renderer);
                GL11.glPopMatrix();
            }
            //ライン
            if (pass === 0) {
                for (var i = 0; i < selectPosList.length - 1; i++) {
                    var prevPos = i > 0 ? selectPosList[i - 1] : null;
                    var currentPos = selectPosList[i];
                    var nextPos = selectPosList[i + 1];
                    renderScaleLine(currentPos, nextPos, true, posX, posY, posZ, sel_line, sel_scale1, sel_scale10, true);
                    if (prevPos) {
                        renderLineAngle(prevPos, currentPos, nextPos, posX, posY, posZ);
                    }
                    if (changeDisplay && i === 0) {
                        renderCircle(currentPos, nextPos, posX, posY, posZ);
                    }
                }
            }

        }
        else {
            //非アクティブ
            GL11.glPushMatrix();
            body.render(renderer);
            GL11.glPopMatrix();
        }
    }
}

//####  関数  ####
//# クライアントサイド #
function renderScaleLine(currentPos, nextPos, isRenderCenter, posX, posY, posZ, lineObj, scale1Obj, scale10Obj, isDismount) {
    var wireVec = new Vec3(currentPos[0] - nextPos[0], currentPos[1] - nextPos[1], currentPos[2] - nextPos[2]);
    var len = wireVec.length();
    var playerVec = new Vec3(posX - nextPos[0], posY - nextPos[1], posZ - nextPos[2]);
    if (isDismount) playerVec = new Vec3(currentPos[0] - nextPos[0], currentPos[1] - nextPos[1], currentPos[2] - nextPos[2]);

    GL11.glPushMatrix();

    GL11.glTranslatef(currentPos[0], currentPos[1], currentPos[2]);
    GL11.glTranslatef(-posX, -posY, -posZ);

    //マーカー(始点)
    point.render(renderer);

    GL11.glRotatef(wireVec.getYaw() + 90, 0, 1, 0);
    GL11.glRotatef(-wireVec.getPitch(), 0, 0, 1);

    //マーカー(終点)
    GL11.glPushMatrix();
    GL11.glTranslatef(len, 0, 0);
    point.render(renderer);
    GL11.glPopMatrix();

    //ライン
    GL11.glPushMatrix();
    GL11.glScalef(len, 1, 1);
    lineObj.render(renderer);
    GL11.glPopMatrix();

    //スケール
    GL11.glPushMatrix();
    for (var i = 0; i <= Math.floor(len); i++) {
        GL11.glPushMatrix();
        GL11.glTranslatef(i, 0, 0);
        if (i % 10 == 0) scale10Obj.render(renderer);
        else scale1Obj.render(renderer);
        GL11.glPopMatrix();
    }
    GL11.glPopMatrix();

    //距離パネル
    drawDistancePanel(len, isRenderCenter, playerVec, wireVec, isDismount, false);
    drawDistancePanel(len, isRenderCenter, playerVec, wireVec, isDismount, true);

    GL11.glPopMatrix();
}

function drawDistancePanel(len, isRenderCenter, playerVec, wireVec, isDismount, isFlipped) {
    GL11.glPushMatrix();

    var panelPosX = isRenderCenter ? (len / 2) : len;
    GL11.glTranslatef(panelPosX, 0, 0);
    GL11.glRotatef(-(wireVec.getYaw() + 90), 0, 1, 0);
    GL11.glRotatef(wireVec.getPitch(), 0, 0, 1);
    GL11.glRotatef(playerVec.getYaw() + 90, 0, 1, 0);
    if (isDismount) GL11.glRotatef(90, 0, 1, 0);
    GL11.glRotatef(-playerVec.getPitch(), 0, 0, 1);
    if (isFlipped) GL11.glRotatef(180, 0, 1, 0);

    drawNumberPanel(str_len, len);

    GL11.glPopMatrix();
}

function renderLineAngle(prevPos, currentPos, nextPos, posX, posY, posZ) {
    var toPrevVec = new Vec3(prevPos[0] - currentPos[0], prevPos[1] - currentPos[1], prevPos[2] - currentPos[2]);
    var toNextVec = new Vec3(nextPos[0] - currentPos[0], nextPos[1] - currentPos[1], nextPos[2] - currentPos[2]);
    var angle = Math.abs(relativeYaw(toPrevVec.getYaw(), toNextVec.getYaw()));
    GL11.glPushMatrix();

    GL11.glTranslatef(currentPos[0], currentPos[1], currentPos[2]);
    GL11.glTranslatef(-posX, -posY, -posZ);

    //角度パネル
    drawAnglePanel(toNextVec, angle, false);
    drawAnglePanel(toNextVec, angle, true);

    GL11.glPopMatrix();
}

function drawAnglePanel(toNextVec, angle, isFlipped) {
    GL11.glPushMatrix();

    GL11.glTranslatef(0, 0.5, 0);
    GL11.glRotatef((toNextVec.getYaw() - 90), 0, 1, 0);
    GL11.glRotatef(toNextVec.getPitch(), 0, 0, 1);
    GL11.glRotatef(90, 0, 0, 1);
    if (isFlipped) GL11.glRotatef(180, 0, 1, 0);
    GL11.glTranslatef(0, -1.5, 0);
    GL11.glScalef(0.5, 0.5, 0.5);

    drawNumberPanel(str_angle, angle);

    GL11.glPopMatrix();
}

function drawNumberPanel(symbolObj, value) {
    var match = String(value).match(/^(-?\d+)(\.\d{0,2})?/);
    if (!match) return null;
    var integerPart = match[1];
    var decimalPart = match[2] ? match[2].substring(1) : "00";
    while (decimalPart.length < 2) {
        decimalPart += "0";
    }

    symbolObj.render(renderer);
    str_colon.render(renderer);

    for (var i = 0; i < integerPart.length; i++) {
        var num = Number(integerPart.slice(i, i + 1));
        GL11.glPushMatrix();
        GL11.glTranslatef(0, 0, i);
        strObj[num].render(renderer);
        if (i === (integerPart.length - 1)) { str_decimal.render(renderer); }
        GL11.glPopMatrix();
    }

    GL11.glTranslatef(0, 0, integerPart.length + 1);

    for (var i = 0; i < decimalPart.length; i++) {
        var num = Number(decimalPart.slice(i, i + 1));
        GL11.glPushMatrix();
        GL11.glTranslatef(0, 0, i);
        strObj[num].render(renderer);
        GL11.glPopMatrix();
    }
}

function renderCircle(currentPos, nextPos, posX, posY, posZ) {
    var toNextVec = new Vec3(nextPos[0] - currentPos[0], 0, nextPos[2] - currentPos[2]);
    var scale = toNextVec.length();

    GL11.glPushMatrix();

    GL11.glTranslatef(currentPos[0], currentPos[1], currentPos[2]);
    GL11.glTranslatef(-posX, -posY, -posZ);
    GL11.glScalef(scale, scale, scale);
    circle.render(renderer);

    GL11.glPopMatrix();
}

//相対角度を計算 時計回り:+x 反時計回り:-x
function relativeYaw(yaw, baseYaw) {
    var d1 = ((yaw - baseYaw) - 360) % 360;
    var d2 = ((yaw - baseYaw) + 360) % 360;
    return Math.abs(d1) < Math.abs(d2) ? d1 : d2;
}

//改造済み
function getLookingPos(world, offset, isPushOption) {
    var pos = null;
    var player = MCWrapperClient.getPlayer();
    var mop = BlockUtil.getMOPFromPlayer(player, cursorMaxDistance, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;
        pos = {
            posX: lookingVec.field_72450_a,
            posY: lookingVec.field_72448_b,
            posZ: lookingVec.field_72449_c
        }
    }
    return pos;
}

function getAroundInsulatorList(world, x, y, z) {
    var tileEntityList = getAroundTileEntity(world, x, y, z, 3.5);
    var list = [];
    for (var i = 0; i < tileEntityList.length; i++) {
        var tile = tileEntityList[i];
        if (tile instanceof TileEntityInsulator) list.push(tile);
    }
    return list;
}

//指定座標の周囲にあるtileEntityを取得する
function getAroundTileEntity(world, x, y, z, range) {
    var tileEntityList = [];
    var offset = Math.floor(range / 2);
    for (var xIdx = 0; xIdx < range; xIdx++) {
        for (var zIdx = 0; zIdx < range; zIdx++) {
            for (var yIdx = 0; yIdx < range; yIdx++) {
                var posX = x + xIdx - offset;
                var posY = y + yIdx - offset;
                var posZ = z + zIdx - offset;
                var tile = getTileEntity(world, posX, posY, posZ);
                if (tile) tileEntityList.push(tile);
            }
        }
    }
    return tileEntityList;
}

function getTileEntityPos(tileEntity) {
    if (isOldVer) {
        return {
            x: tileEntity.field_145851_c,
            y: tileEntity.field_145848_d,
            z: tileEntity.field_145849_e
        }
    }
    else {
        var blockPos = tileEntity.func_174877_v();
        return {
            x: blockPos.func_177958_n(),
            y: blockPos.func_177956_o(),
            z: blockPos.func_177952_p()
        }
    }
}

//# 共通 #

function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function getTileEntity(world, x, y, z) {
    if (isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
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