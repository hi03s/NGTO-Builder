var NGTOBuilderVersion = "1.10";

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

    //Yオフセット設定
    offsetUp: Keyboard.KEY_UP,
    offsetDown: Keyboard.KEY_DOWN,

    //Yオフセットをリセット
    resetOffset: Keyboard.KEY_F,

    //ワイヤーを生成する
    build: Keyboard.KEY_RETURN,

    //マーカー全削除
    allDelete: Keyboard.KEY_C,

    //Undo
    undo: Keyboard.KEY_Z,

    //ヘルプのON/OFF
    isHideHelp: Keyboard.KEY_H,

    //終了
    endEdit: Keyboard.KEY_Q
}
//##  Settings END  ###

var langList = ["en_us", "ja_jp"];

function init(par1, par2) {
    body = renderer.registerParts(new Parts("body"));
    line = renderer.registerParts(new Parts("line"));
    point = renderer.registerParts(new Parts("point"));
    cursor = renderer.registerParts(new Parts("cursor"));
    line_cursor = renderer.registerParts(new Parts("line_cursor"));
    offsetCursor = renderer.registerParts(new Parts("offsetCursor"));
    distanceMarker = renderer.registerParts(new Parts("distanceMarker"));
    insulatorCursor = renderer.registerParts(new Parts("insulatorCursor"));
    selectedOffsetCursor = renderer.registerParts(new Parts("selectedOffsetCursor"));
    distanceDisplay = [];
    for (var i = 0; i <= 9; i++) {
        distanceDisplay[i] = renderer.registerParts(new Parts("distance_" + i));
    }
    distanceDisplayM = renderer.registerParts(new Parts("distance_M"));

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
    //var yaw = MCWrapper.getYaw(entity); //yawはサーバー側で0に固定
    var player = MCWrapperClient.getPlayer();
    var offset = dataMap.getInt("offset");
    var isPushOptionKey = Keyboard.isKeyDown(KeyMaps.optionKey);
    var lookingBlockPos = getLookingPos(world, offset, isPushOptionKey);
    var hostPlayerEntityId = dataMap.getString("hostPlayerEntityId");
    var hostPlayer = null;
    if (hostPlayerEntityId !== "") hostPlayer = world.func_73045_a(hostPlayerEntityId);
    var isLeftClick = Mouse.isButtonDown(0);
    var isRightClick = Mouse.isButtonDown(1);
    var VERSIONS_server = dataMap.getString("VERSIONS");
    if (VERSIONS_server === "") VERSIONS_server = "~ 1.3";
    var isVersionChecked = dataMap.getBoolean("isVersionChecked");
    var isHideHelp = dataMap.getBoolean("isHideHelp");

    doFollowing(entity, hostPlayer);//1.12用

    if (hostPlayer) {
        //初期化
        var isInitialized = dataMap.getBoolean("isInitialized");
        if (!isInitialized) {
            dataMap.setBoolean("isInitialized", true, 0);
            dataMap.setInt("offset", 1, 1);
            offset = 1;
            lookingBlockPos = getLookingPos(world, offset, isPushOptionKey);
        }

        var selectPosList = [];
        var selectPosList_JSON = dataMap.getString("selectPosList").replace(/☆/g, ",");
        if (selectPosList_JSON !== "") selectPosList = JSON.parse(selectPosList_JSON);

        //操作プレイヤー
        if (hostPlayer === player) {
            //バージョンチェック
            if ((VERSIONS_server != NGTOBuilderVersion) && !isVersionChecked) {
                dataMap.setBoolean("isVersionChecked", true, 0);
                NGTLog.sendChatMessage(hostPlayer, "§c[NGTO Builder]Versions don't match!");
                NGTLog.sendChatMessage(hostPlayer, "§cClient:" + NGTOBuilderVersion);
                NGTLog.sendChatMessage(hostPlayer, "§cServer:" + VERSIONS_server);
            }

            //キー入力関連操作
            var currentItem = getSelectedSlotItem(player);
            isRightClick = isRightClick && !(currentItem && ignoreItemList.indexOf(currentItem.func_77973_b()) > -1);
            var isBuilding = dataMap.getBoolean("isBuilding");
            var isUndo = dataMap.getBoolean("isUndo");
            var prevIsClick = dataMap.getBoolean("prevIsClick");
            if (!prevIsClick && (isLeftClick || isRightClick)) dataMap.setBoolean("prevIsClick", true, 0);
            if (prevIsClick && !isLeftClick && !isRightClick) dataMap.setBoolean("prevIsClick", false, 0);

            if (!isOpenGUI && !isBuilding && !isUndo) {
                //Yオフセット
                var prevInputOffsetKey = dataMap.getBoolean("prevInputOffsetKey");
                var isKeyDown_up = Keyboard.isKeyDown(KeyMaps.offsetUp);
                var isKeyDown_down = Keyboard.isKeyDown(KeyMaps.offsetDown);
                var isKeyDown_reset = Keyboard.isKeyDown(KeyMaps.resetOffset);
                if (!isPushOptionKey) {
                    //↑キー
                    if (isKeyDown_up) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offset += 1;
                            dataMap.setInt("offset", offset, 1);
                        }
                    }

                    //↓キー
                    if (isKeyDown_down) {
                        dataMap.setBoolean("prevInputOffsetKey", true, 0);
                        if (!prevInputOffsetKey) {
                            offset -= 1;
                            dataMap.setInt("offset", offset, 1);
                        }
                    }

                    //Fキー
                    if (isKeyDown_reset) {
                        offset = 1;
                        dataMap.setInt("offset", 1, 1);
                    }
                }
                if (!isKeyDown_up && !isKeyDown_down && prevInputOffsetKey) {
                    dataMap.setBoolean("prevInputOffsetKey", false, 0);
                }

                //座標指定
                if (lookingBlockPos && !prevIsClick) {
                    //右クリック ポイント追加
                    if (isRightClick) {
                        var lastPos = selectPosList[selectPosList.length - 1];
                        var selPosX = lookingBlockPos.x;
                        var selPosY = lookingBlockPos.y;
                        var selPosZ = lookingBlockPos.z;
                        var selSide = lookingBlockPos.side;
                        var selOffset = lookingBlockPos.offset;
                        if (selectPosList.length > 0 && lastPos[0] == selPosX && lastPos[1] == selPosY && lastPos[2] == selPosZ) {
                            NGTLog.sendChatMessage(player, "This coordinate can't be added");
                        }
                        else {
                            selectPosList.push([selPosX, selPosY, selPosZ, selSide, selOffset]);
                        }
                    }
                    //左クリック ポイント削除
                    if (isLeftClick) {
                        if (selectPosList.length > 0) selectPosList.pop();
                    }
                    //データ変更
                    if ((isRightClick || isLeftClick)) {
                        selectPosList_JSON = JSON.stringify(selectPosList).replace(/,/g, "☆");
                        dataMap.setString("selectPosList", selectPosList_JSON, 1);
                    }
                }

                //マーカー削除
                if (Keyboard.isKeyDown(KeyMaps.allDelete)) {
                    selectPosList = [];
                    selectPosList_JSON = "[]";
                    dataMap.setString("selectPosList", selectPosList_JSON, 1);
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

                //ワイヤー生成
                if (Keyboard.isKeyDown(KeyMaps.build) && currentItem && selectPosList.length > 1) {
                    //手持ちのアイテムがワイヤーアイテムか判別する
                    if (currentItem.func_77973_b() === RTMItem.itemWire) {
                        dataMap.setBoolean("isBuilding", true, 1);
                    }
                }

                //undo
                if (Keyboard.isKeyDown(KeyMaps.optionKey) && Keyboard.isKeyDown(KeyMaps.undo) && !isBuilding && !isUndo) {
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
                }
            }
            if (isUndo) {
                if (dataMap.getBoolean("buildComplete")) {//生成完了
                    dataMap.setBoolean("isUndo", false, 1);
                    dataMap.setBoolean("buildComplete", false, 1);
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
                GL11.glTranslatef(lookingBlockPos.x + 0.5, lookingBlockPos.y + 0.5, lookingBlockPos.z + 0.5);
                GL11.glTranslatef(-posX, -posY, -posZ);
                cursor.render(renderer);
                GL11.glPopMatrix();

                //オフセットカーソル
                var offsetPos = lookingBlockPos.offset;
                if (offsetPos[0] !== 0 || offsetPos[1] !== 0 || offsetPos[2] !== 0) {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lookingBlockPos.x + 0.5, lookingBlockPos.y + 0.5, lookingBlockPos.z + 0.5);
                    GL11.glTranslatef(offsetPos[0], offsetPos[1], offsetPos[2]);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    offsetCursor.render(renderer);
                    GL11.glPopMatrix();
                }

                //レールスナップ時の周囲の碍子を表示
                var aroundInsulatorList = getAroundInsulatorList(world, lookingBlockPos.x + 0.5, lookingBlockPos.y + 0.5, lookingBlockPos.z + 0.5);
                for (var i = 0; i < aroundInsulatorList.length; i++) {
                    var aroundInsulator = aroundInsulatorList[i];
                    var insulatorPos = getTileEntityPos(aroundInsulator);
                    GL11.glPushMatrix();
                    GL11.glTranslatef(insulatorPos.x + 0.5, insulatorPos.y + 0.5, insulatorPos.z + 0.5);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    insulatorCursor.render(renderer);
                    GL11.glPopMatrix();
                }

                //カーソルライン描画
                if (selectPosList.length > 0) {
                    var currentPos = selectPosList[selectPosList.length - 1];
                    var nextPos = [lookingBlockPos.x, lookingBlockPos.y, lookingBlockPos.z];
                    var wireVec = new Vec3(currentPos[0] - nextPos[0], currentPos[1] - nextPos[1], currentPos[2] - nextPos[2]);
                    var len = wireVec.length();
                    var distance = Math.round(len).toString();
                    var playerVec = new Vec3(posX - nextPos[0], posY - nextPos[1], posZ - nextPos[2]);
                    GL11.glPushMatrix();
                    GL11.glTranslatef(currentPos[0] + 0.5, currentPos[1] + 0.5, currentPos[2] + 0.5);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    GL11.glRotatef(wireVec.getYaw() + 90, 0, 1, 0);
                    GL11.glRotatef(-wireVec.getPitch(), 0, 0, 1);

                    GL11.glPushMatrix();
                    GL11.glScalef(len, 1, 1);
                    line_cursor.render(renderer);
                    GL11.glPopMatrix();

                    GL11.glTranslatef(len, 0, 0);
                    distanceMarker.render(renderer);


                    GL11.glRotatef(-(wireVec.getYaw() + 90), 0, 1, 0);
                    GL11.glRotatef(playerVec.getYaw() + 90, 0, 1, 0);
                    GL11.glRotatef(-playerVec.getPitch(), 0, 0, 1);
                    for (var i = 0; i < distance.length; i++) {
                        var num = Number(distance.slice(i, i + 1));
                        GL11.glPushMatrix();
                        GL11.glTranslatef(0, 0, i);
                        distanceDisplay[num].render(renderer);
                        if (i === (distance.length - 1)) distanceDisplayM.render(renderer);
                        GL11.glPopMatrix();
                    }

                    GL11.glPopMatrix();
                }
            }

            //指定ポイント・線描画
            if (selectPosList.length > 0) {
                for (var i = 0; i < selectPosList.length - 1; i++) {
                    var currentPos = selectPosList[i];
                    var offsetPos = currentPos[4];
                    var nextPos = selectPosList[i + 1];
                    var wireVec = new Vec3(currentPos[0] - nextPos[0], currentPos[1] - nextPos[1], currentPos[2] - nextPos[2]);
                    GL11.glPushMatrix();
                    GL11.glTranslatef(currentPos[0] + 0.5, currentPos[1] + 0.5, currentPos[2] + 0.5);
                    GL11.glTranslatef(-posX, -posY, -posZ);
                    point.render(renderer);
                    if (offsetPos[0] !== 0 || offsetPos[1] !== 0 || offsetPos[2] !== 0) {
                        GL11.glPushMatrix();
                        GL11.glTranslatef(offsetPos[0], offsetPos[1], offsetPos[2]);
                        selectedOffsetCursor.render(renderer);
                        GL11.glPopMatrix();
                    }
                    GL11.glRotatef(wireVec.getYaw() + 90, 0, 1, 0);
                    GL11.glRotatef(-wireVec.getPitch(), 0, 0, 1);
                    GL11.glScalef(wireVec.length(), 1, 1)
                    line.render(renderer);
                    GL11.glPopMatrix();
                }
                var lastPos = selectPosList[selectPosList.length - 1];
                var lastOffsetPos = lastPos[4];
                GL11.glPushMatrix();
                GL11.glTranslatef(lastPos[0] + 0.5, lastPos[1] + 0.5, lastPos[2] + 0.5);
                GL11.glTranslatef(-posX, -posY, -posZ);
                point.render(renderer);
                if (lastOffsetPos[0] !== 0 || lastOffsetPos[1] !== 0 || lastOffsetPos[2] !== 0) {
                    GL11.glPushMatrix();
                    GL11.glTranslatef(lastOffsetPos[0], lastOffsetPos[1], lastOffsetPos[2]);
                    selectedOffsetCursor.render(renderer);
                    GL11.glPopMatrix();
                }
                GL11.glPopMatrix();
            }
        }
    }
}

//####  関数  ####
//# クライアントサイド #
function getLookingPos(world, offset, isPushOption) {
    var pos = null;
    var player = MCWrapperClient.getPlayer();
    var mop = BlockUtil.getMOPFromPlayer(player, cursorMaxDistance, true);
    if (mop) {
        var lookingVec = mop.field_72307_f;
        if (isOldVer) {
            var x = mop.field_72311_b;
            var y = mop.field_72312_c;
            var z = mop.field_72309_d;
            var side = mop.field_72310_e;//Int
            var tile = getTileEntity(world, x, y, z);
            var modelOffset = [0, 0, 0];
            if (!isPushOption && (tile instanceof TileEntityLargeRailBase)) {
                var rm = tile.getRailMap(null);
                if (rm) {
                    side = 1;
                    var rmSplit = Math.floor(rm.getLength() * 2);
                    var rmPosIdx = rm.getNearlestPoint(rmSplit, x + 0.5, z + 0.5);
                    var rmPos = rm.getRailPos(rmSplit, rmPosIdx);
                    var rmHeight = rm.getRailHeight(rmSplit, rmPosIdx);
                    var offsetX = rmPos[1] - (x + 0.5);
                    var offsetY = rmHeight - y;
                    var offsetZ = rmPos[0] - (z + 0.5);
                    modelOffset = [offsetX, offsetY, offsetZ];
                }
            }
            if (isPushOption) {
                modelOffset = [
                    lookingVec.field_72450_a - (x + 0.5),
                    lookingVec.field_72448_b - (y + 0.5),
                    lookingVec.field_72449_c - (z + 0.5)
                ];
                switch (side) {
                    case 0: modelOffset[1] = 0; break; // 下
                    case 1: modelOffset[1] = 0; break; // 上
                    case 2: modelOffset[2] = 0; break; // 北
                    case 3: modelOffset[2] = 0; break; // 南
                    case 4: modelOffset[0] = 0; break; // 西
                    case 5: modelOffset[0] = 0; break; // 東
                }
            }
            switch (side) {
                case 0: y = y - offset; break; // 下
                case 1: y = y + offset; break; // 上
                case 2: z = z - offset; break; // 北
                case 3: z = z + offset; break; // 南
                case 4: x = x - offset; break; // 西
                case 5: x = x + offset; break; // 東
            }
            pos = {
                x: x,
                y: y,
                z: z,
                side: side,
                offset: modelOffset,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
        }
        else {
            var blockPos = mop.func_178782_a();
            var x = blockPos.func_177958_n();
            var y = blockPos.func_177956_o();
            var z = blockPos.func_177952_p();
            var side = mop.field_178784_b;//EnumFacing
            var tile = getTileEntity(world, x, y, z);
            var modelOffset = [0, 0, 0];
            if (!isPushOption && (tile instanceof TileEntityLargeRailBase)) {
                var rm = tile.getRailMap(null);
                if (rm) {
                    side = EnumFacing.UP;
                    var rmSplit = Math.floor(rm.getLength() * 2);
                    var rmPosIdx = rm.getNearlestPoint(rmSplit, x + 0.5, z + 0.5);
                    var rmPos = rm.getRailPos(rmSplit, rmPosIdx);
                    var rmHeight = rm.getRailHeight(rmSplit, rmPosIdx);
                    var offsetX = rmPos[1] - (x + 0.5);
                    var offsetY = rmHeight - y;
                    var offsetZ = rmPos[0] - (z + 0.5);
                    modelOffset = [offsetX, offsetY, offsetZ];
                }
            }
            if (isPushOption) {
                modelOffset = [
                    lookingVec.field_72450_a - (x + 0.5),
                    lookingVec.field_72448_b - (y + 0.5),
                    lookingVec.field_72449_c - (z + 0.5)
                ];
                switch (side.func_176745_a()) {
                    case 0: modelOffset[1] = 0; break; // 下
                    case 1: modelOffset[1] = 0; break; // 上
                    case 2: modelOffset[2] = 0; break; // 北
                    case 3: modelOffset[2] = 0; break; // 南
                    case 4: modelOffset[0] = 0; break; // 西
                    case 5: modelOffset[0] = 0; break; // 東
                }
            }
            var offsetBlockPos = blockPos.func_177967_a(side, offset);
            pos = {
                x: offsetBlockPos.func_177958_n(),
                y: offsetBlockPos.func_177956_o(),
                z: offsetBlockPos.func_177952_p(),
                side: side.func_176745_a(),
                offset: modelOffset,
                posX: lookingVec.field_72450_a,
                posY: lookingVec.field_72448_b,
                posZ: lookingVec.field_72449_c
            };
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