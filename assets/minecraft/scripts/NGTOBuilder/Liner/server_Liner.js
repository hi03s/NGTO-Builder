var NGTOBuilderVersion = "1.12";

//MCTE
importPackage(Packages.jp.ngt.mcte.item);//ItemMiniature

//NGTLib
importPackage(Packages.jp.ngt.ngtlib.io);//NGTLog
importPackage(Packages.jp.ngt.ngtlib.math);//Vec3
importPackage(Packages.jp.ngt.ngtlib.util);//NGTUtilClient MCWrapper
importPackage(Packages.jp.ngt.ngtlib.block);//BlockUtil TileEntityCustom NGTObject BlockSet

//RealTrainMod
importPackage(Packages.jp.ngt.rtm);//RTMCore
importPackage(Packages.jp.ngt.rtm.rail);//TileEntityLargeRailBase

//Minecraft
importPackage(Packages.net.minecraft.block);//BlockStairs Block
importPackage(Packages.net.minecraft.init);//Blocks
importPackage(Packages.net.minecraft.nbt);//NBTTagCompound
importPackage(Packages.net.minecraft.item);//ItemBlock

var isOldVer = RTMCore.VERSION.indexOf("1.7.10") >= 0;
var isKaizPatch = RTMCore.VERSION.indexOf("KaizPatch") !== -1;
var hostPlayerList = new java.util.HashMap();
var buildNGTO = new java.util.HashMap();
var buildDataList = new java.util.HashMap();
var undoBlockListMap = new java.util.HashMap();

//#################
//##  Settings  ###
//#################
var buildLimitPerTick = 500;//ブロックの生成速度 500 blocks/tick (10000 blocks/sec)
//##  Settings END  ###

function onUpdate(entity, scriptExecuter) {
    entity.field_70177_z = 0;

    var dataMap = entity.getResourceState().getDataMap();
    var world = entity.field_70170_p;
    var hostPlayer = hostPlayerList.get(entity);
    var rider = getRider(entity);
    var ridingEntity = getRidingEntity(entity);

    if (dataMap.getString("VERSIONS") === "") {
        dataMap.setString("VERSIONS", NGTOBuilderVersion, 1);
    }

    doFollowing(entity, hostPlayer);//1.12用

    if (!hostPlayer) {//ホストプレイヤー未登録
        if (rider) {
            hostPlayerList.put(entity, rider);
            var playerEntityId = rider.func_145782_y();
            dataMap.setString("hostPlayerEntityId", playerEntityId, 1);
            dismountPlayer(entity);//プレイヤーを降ろす
            startRiding(entity, rider);//プレイヤーに乗る
        }
        else if (ridingEntity) {
            hostPlayerList.put(entity, ridingEntity);
            var playerEntityId = ridingEntity.func_145782_y();
            dataMap.setString("hostPlayerEntityId", playerEntityId, 1);
            //初期化
            dataMap.setString("buildData", "", 1);
            dataMap.setBoolean("isUndo", false, 1);
            dataMap.setBoolean("isBuilding", false, 1);
            dataMap.setBoolean("buildComplete", false, 1);
        }
    }
    else if (rider) {
        dismountPlayer(entity);//プレイヤーを降ろす
        dataMap.setBoolean("isEndEdit", true, 1);
    }
    else {//ホストプレイヤー登録済み
        var isBuilding = dataMap.getBoolean("isBuilding");
        var isUndo = dataMap.getBoolean("isUndo");
        var buildBezierPosList_string = dataMap.getString("buildData").replace(/☆/g, ",");
        var buildBezierPosList = buildBezierPosList_string !== "" ? JSON.parse(buildBezierPosList_string) : null;
        var isBuildComplete = dataMap.getBoolean("buildComplete");
        var undoBlockList = undoBlockListMap.get(entity);
        if (!undoBlockList) undoBlockList = [];
        var offsetY_ngto = dataMap.getInt("offsetY_ngto");
        var isNoRepeat = dataMap.getBoolean("isNoRepeat");
        var isMasking = dataMap.getBoolean("isMasking");
        var isEndEdit = dataMap.getBoolean("isEndEdit");
        var isPlaceAirBlock = dataMap.getBoolean("isPlaceAirBlock");

        //生成処理
        if (isBuilding && !isBuildComplete && buildBezierPosList) {
            var ngto = buildNGTO.get(entity);
            if (!ngto) {
                //生成するNGTOを登録する
                var currentItem = getSelectedSlotItem(hostPlayer);
                var nbt = currentItem.func_77978_p();
                var itemBlock = Block.func_149634_a(currentItem.func_77973_b());
                if (nbt && nbt.func_74764_b("BlocksData")) {
                    buildNGTO.put(entity, ItemMiniature.getNGTObject(nbt));
                }
                else if (itemBlock instanceof Block) {
                    var itemMetadata = currentItem.func_77960_j();
                    var itemNBT = currentItem.func_77978_p();
                    var blockSet = new BlockSet(itemBlock, itemMetadata, itemNBT);
                    var ngtoData = NGTObject.createNGTO([blockSet], 1, 1, 1, 0, 0, 0);
                    buildNGTO.put(entity, ngtoData);
                }
                else dataMap.setBoolean("buildComplete", true, 1);
            }
            else {
                var buildData = buildDataList.get(entity);
                if (!buildData) {
                    //ブロックの配置を計算する
                    var bezierCurveList = createBezierList(buildBezierPosList);//ベジェ曲線生成
                    var blockSetListArray = getBlockSetListArray(ngto, isPlaceAirBlock);//NGTO解析 Z軸方向に輪切りにする
                    var replaceBlockList = null;
                    if (isMasking) replaceBlockList = getMaskingBlocks(hostPlayer);
                    var lastNGTOZIndex = 0;
                    var blockDataList = [];
                    var isSkip = false;
                    var addedPosHashSet = new java.util.HashSet();
                    bezierCurveList.forEach(function (bezierCurve3d) {
                        if (isSkip) return;
                        var split = Math.floor(bezierCurve3d.getLength() * 2);//補完処理のため分割精度を2倍にする
                        var ngtoSplit = Math.floor(split / 2);//NGTOの輪切りは1m単位のため
                        for (var index = 0; index < split; index++) {
                            if (isSkip) break;
                            var ngtoIndex = Math.floor(index / 2);
                            var pos = bezierCurve3d.getPoint(index, split);
                            var bezierYaw = bezierCurve3d.getYaw(index, split);
                            var bezierPitch = bezierCurve3d.getPitch(index, split);
                            var ngtoZIndex = (lastNGTOZIndex + ngtoIndex) % ngto.zSize;
                            if (ngtoIndex === ngtoSplit - 1) lastNGTOZIndex = ngtoZIndex;
                            var rotateBlockSetList = rotationBlockSetList(blockSetListArray, ngtoZIndex, pos[0], pos[1], pos[2], -bezierYaw, -bezierPitch);
                            for (var blockIdx = 0; blockIdx < rotateBlockSetList.length; blockIdx++) {
                                var renderBlockPos = rotateBlockSetList[blockIdx];
                                if (isMasking) {
                                    var worldBlock = getBlock(world, renderBlockPos[1], renderBlockPos[2], renderBlockPos[3]);
                                    var isIgnoreSet = replaceBlockList.indexOf(worldBlock) === -1;
                                    //空気ブロック設置なし
                                    if (!isPlaceAirBlock && isIgnoreSet) continue;
                                    //空気ブロック設置あり
                                    if (isPlaceAirBlock) {
                                        //設置するブロックが空気ブロックではない場合、マスクの対象になる
                                        if (rotateBlockSetList[blockIdx][0] !== Blocks.field_150350_a && isIgnoreSet) continue;
                                    }
                                }
                                var pos_string = [Math.floor(renderBlockPos[1]), Math.floor(renderBlockPos[2]), Math.floor(renderBlockPos[3])].join();
                                if (addedPosHashSet.add(pos_string)) {
                                    blockDataList.push([renderBlockPos[0], Math.floor(renderBlockPos[1]), Math.floor(renderBlockPos[2]), Math.floor(renderBlockPos[3]), -bezierYaw]);
                                }
                            }
                            if (isNoRepeat && ngtoZIndex === ngto.zSize - 1) {
                                isSkip = true;
                                break;
                            }
                        }
                    });
                    buildDataList.put(entity, blockDataList);
                    undoBlockListMap.put(entity, []);
                }
                else {
                    //ブロックを設置する
                    //buildData = [[BlockSet, x, y, z, bezierYaw],...]
                    for (var i = 0; i < buildLimitPerTick; i++) {//buildLimitPerTickで指定したブロック数を一度に生成する
                        if (buildData.length === 0) break;
                        var blockSet = buildData[0][0];
                        var blockX = buildData[0][1];
                        var blockY = buildData[0][2] + offsetY_ngto;
                        var blockZ = buildData[0][3];
                        var blockYaw = buildData[0][4];
                        var metadata = blockSet.metadata;
                        var backupBlock = getBlock(world, blockX, blockY, blockZ);
                        var backupMetadata = getMetadata(world, blockX, blockY, blockZ);
                        var tileEntity = getTileEntity(world, blockX, blockY, blockZ);
                        //同一ブロックはスキップ
                        if (!tileEntity && backupBlock === blockSet.block && backupMetadata === metadata) {
                            buildData.shift();
                            continue;
                        }
                        //一部のブロックは向きをメタデータから変える
                        var isChangeMetaData = false;
                        var instanceList = [BlockStairs, BlockDoor, BlockFenceGate, BlockLog, BlockLadder, BlockButton];
                        for (var instanceIdx = 0; instanceIdx < instanceList.length; instanceIdx++) {
                            if (blockSet.block instanceof instanceList[instanceIdx]) {
                                isChangeMetaData = true;
                                break;
                            }
                        }
                        //ドア上部はスキップ
                        if (blockSet.block instanceof BlockDoor && metadata >= 8) {
                            buildData.shift();
                            continue;
                        }
                        if (isChangeMetaData) {
                            var directions = [0, 3, 2, 1];//[南,東,北,西]
                            if (blockSet.block instanceof BlockStairs) directions = [0, 3, 1, 2];//階段はメタデータの構造が違うため
                            if (blockSet.block instanceof BlockLog) directions = [];//原木もメタデータの構造が違う
                            if (blockSet.block instanceof BlockLadder) directions = [2, 4, 3, 5];//はしご
                            if (blockSet.block instanceof BlockButton) directions = [2, 3, 1, 4];//ボタン
                            var blockDir = metadata & 3;//2bitで方角管理
                            var option1 = metadata & 4;//3bitめを取得
                            var option2 = metadata & 8;//4bitめを取得
                            var currentDirIndex = directions.indexOf(blockDir);
                            var rotateIndex = 0;
                            if (45 <= blockYaw && blockYaw < 135) rotateIndex = 1;
                            if (135 <= blockYaw && blockYaw < 225) rotateIndex = 2;
                            if (225 <= blockYaw && blockYaw < 315) rotateIndex = 3;
                            if (currentDirIndex !== -1) {
                                var newDirIndex = (currentDirIndex + rotateIndex) % directions.length;
                                blockDir = directions[newDirIndex];
                            }
                            metadata = option2 | option1 | blockDir;//新しいメタデータ
                            if (blockSet.block instanceof BlockLog) {//原木は3/4bit入れ替えで向きを変える
                                if (rotateIndex === 1 || rotateIndex === 3) {
                                    metadata = metadata ^ 4;
                                    metadata = metadata ^ 8;
                                }
                            }
                        }
                        try {
                            if (!(tileEntity instanceof TileEntityLargeRailBase)) {
                                //ブロックのバックアップ
                                var blockRotation = 0;
                                if (backupBlock instanceof TileEntityPlaceable) blockRotation = backupBlock.getRotation();
                                if (!backupBlock) backupBlock = Blocks.field_150350_a;
                                if (!backupMetadata) backupMetadata = 0;
                                var backupNBT = null;
                                //RTM系ブロックをバックアップするときサーバー側でクラッシュすることがある
                                try {
                                    if (isOldVer) {
                                        if (backupBlock.func_145841_b) {
                                            backupNBT = new NBTTagCompound();
                                            backupBlock.func_145841_b(backupNBT);
                                        }
                                    }
                                    else {
                                        if (backupBlock.func_189515_b) {
                                            backupNBT = new NBTTagCompound();
                                            backupBlock.func_189515_b(backupNBT);
                                        }
                                    }
                                }
                                catch (e) {
                                    NGTLog.debug("[NGTO Builder] Backup error");
                                    NGTLog.debug(e);
                                    NGTLog.debug("----------");
                                    NGTLog.debug("pos: " + blockX + ", " + blockY + ", " + blockZ);
                                    NGTLog.debug("backupBlock: " + backupBlock);
                                    NGTLog.debug("----------");
                                }
                                undoBlockList.push([new BlockSet(backupBlock, backupMetadata, backupNBT), blockX, blockY, blockZ, blockRotation]);
                                undoBlockListMap.put(entity, undoBlockList);

                                //ブロックのセット
                                setBlock(world, blockX, blockY, blockZ, blockSet.block, metadata, 2);
                                if (blockSet.block instanceof BlockDoor) {
                                    var upSideDoorMetaData = 8;
                                    setBlock(world, blockX, blockY + 1, blockZ, blockSet.block, upSideDoorMetaData, 2);
                                }
                                if (hasTileEntity(blockSet) ||
                                    (blockSet.block.func_149716_u && blockSet.block.func_149716_u())) {
                                    var tile = getTileEntity(world, blockX, blockY, blockZ);
                                    if (tile) setTileEntityData(tile, blockSet, blockX, blockY, blockZ, blockYaw);
                                    tileEntity = tile;
                                }
                            }
                        }
                        catch (e) {
                            NGTLog.debug("[NGTO Builder] Error occurred");
                            NGTLog.debug(e);
                            NGTLog.debug("----------");
                            NGTLog.debug("pos: " + blockX + ", " + blockY + ", " + blockZ);
                            NGTLog.debug("blockSet: " + blockSet);
                            NGTLog.debug("blockSet.block: " + blockSet.block);
                            NGTLog.debug("blockSet.metadata: " + blockSet.metadata);
                            NGTLog.debug("----------");
                        }
                        buildData.shift();
                    }
                    if (buildData.length > 0) buildDataList.put(entity, buildData);//残ったブロックは次のTickに持ち越し
                    else {
                        //生成終了
                        dataMap.setBoolean("buildComplete", true, 1);
                        buildNGTO.put(entity, null);
                        buildDataList.put(entity, null);
                        undoBlockListMap.put(entity, undoBlockList.reverse());
                    }
                }
            }
        }
        //undo
        if (isUndo && !isBuildComplete) {
            for (var i = 0; i < buildLimitPerTick; i++) {
                if (undoBlockList.length === 0) break;
                var blockSet = undoBlockList[0][0];
                var block = blockSet.block;
                var metadata = blockSet.metadata;
                var undoX = undoBlockList[0][1];
                var undoY = undoBlockList[0][2];
                var undoZ = undoBlockList[0][3];
                var undoYaw = undoBlockList[0][4];
                try {
                    //ブロックのセット
                    setBlock(world, undoX, undoY, undoZ, block, metadata, 2);
                    if (block instanceof BlockDoor) {
                        var upSideDoorMetaData = 8;
                        setBlock(world, undoX, undoY + 1, undoZ, block, upSideDoorMetaData, 2);
                    }
                    if (hasTileEntity(blockSet) ||
                        (block.func_149716_u && block.func_149716_u())) {
                        var tile = getTileEntity(world, undoX, undoY, undoZ);
                        if (tile) setTileEntityData(tile, blockSet, undoX, undoY, undoZ, undoYaw);
                    }
                }
                catch (e) {
                    NGTLog.debug("[NGTO Builder] Error occurred (undo)");
                    NGTLog.debug(e);
                    NGTLog.debug("----------");
                    NGTLog.debug("pos: " + undoX + ", " + undoY + ", " + undoZ);
                    NGTLog.debug("blockSet.block: " + block);
                    NGTLog.debug("blockSet.metadata: " + metadata);
                    NGTLog.debug("----------");
                }
                undoBlockList.shift();
            }
            if (undoBlockList.length > 0) undoBlockListMap.put(entity, undoBlockList);
            else {
                //生成終了
                dataMap.setBoolean("buildComplete", true, 1);
            }
        }
        //isEndEdit
        if (isEndEdit) {
            entity.func_70106_y();
        }
    }
}

//####  関数  ####
//# サーバーサイド #
function getRider(entity) {
    if (isOldVer) {
        return entity.field_70153_n;
    }
    else {
        var passengers = entity.func_184188_bt();
        var rider = passengers.size() > 0 ? passengers.get(0) : null;
        return rider;
    }
}

function getRidingEntity(entity) {
    if (isOldVer) {
        return entity.field_70154_o;
    }
    else {
        return entity.func_184187_bx();
    }
}

function startRiding(entity, targetEntity) {
    if (targetEntity) {
        if (isOldVer) entity.func_70078_a(targetEntity);
        //else entity.func_184220_m(targetEntity);
    }
}

function dismountPlayer(entity) {
    var rider = getRider(entity);
    if (rider) {
        if (isOldVer) rider.func_70078_a(null);
        else rider.func_184210_p();//マルチだけエラーを起こす?
    }
}

function setBlock(world, x, y, z, block, metadata) {
    var flag = 3;
    if (isOldVer) world.func_147465_d(x, y, z, block, metadata, flag);
    else BlockUtil.setBlock(world, x, y, z, block, metadata, flag);
}

function getMetadata(world, x, y, z) {
    if (isOldVer) return world.func_72805_g(x, y, z);
    else return BlockUtil.getMetadata(world, x, y, z);
}

function getTileEntity(world, x, y, z) {
    if (isOldVer) return world.func_147438_o(x, y, z);
    else {
        var blockPos = new Packages.net.minecraft.util.math.BlockPos(Math.floor(x), Math.floor(y), Math.floor(z));
        return world.func_175625_s(blockPos);
    }
}

function setTileEntityData(tile, blockSet, x, y, z, yaw) {
    var nbt = blockSet.nbt;
    //var metadata = blockSet.metadata;
    var prevX = 0;
    var prevY = 0;
    var prevZ = 0;
    if (nbt) {
        var _nbt = nbt.func_74737_b();
        prevX = _nbt.func_74762_e("x");
        prevY = _nbt.func_74762_e("y");
        prevZ = _nbt.func_74762_e("z");
        _nbt.func_74768_a("x", x);
        _nbt.func_74768_a("y", y);
        _nbt.func_74768_a("z", z);

        if (!isOldVer) {//モデル名変換処理
            var modelName = nbt.func_74779_i("ModelName");
            if (modelName) tile.getResourceState().setResourceName(modelName);
        }

        tile.func_145839_a(_nbt);
    }
    if (tile instanceof TileEntityCustom) {
        tile.setPos(x, y, z, prevX, prevY, prevZ);
    }
    else {
        if (isOldVer) {
            tile.field_145851_c = x;
            tile.field_145848_d = y;
            tile.field_145849_e = z;
        }
        else {
            tile.func_174878_a(new Packages.net.minecraft.util.math.BlockPos(x, y, z));
        }
    }
    if (tile instanceof TileEntityPlaceable) {
        var rotation = tile.getRotation() + 90 + yaw;
        tile.setRotation(rotation, true);
    }
    if (tile instanceof BlockStairs) {

    }
}

//# 共通 #
function getBlock(world, x, y, z) {
    if (isOldVer) return world.func_147439_a(x, y, z);
    else return BlockUtil.getBlock(world, x, y, z);
}

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

function createBezierList(bezierPosList) {
    var bezierList = [];
    for (var i = 0; i < bezierPosList.length; i++) {
        var bezierPos = bezierPosList[i];
        bezierList.push(new BezierCurve3D(bezierPos[0], bezierPos[1], bezierPos[2], bezierPos[3]));
    }
    return bezierList;
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

function lerpPoint(pos1, pos2, ratio) {
    return [
        pos1[0] + (pos2[0] - pos1[0]) * ratio,
        pos1[1] + (pos2[1] - pos1[1]) * ratio,
        pos1[2] + (pos2[2] - pos1[2]) * ratio
    ];
}

function getSelectedSlotItem(player) {
    var inventory = player.field_71071_by;
    var index = inventory.field_70461_c;
    if (isOldVer) return inventory.field_70462_a[index];
    else return inventory.field_70462_a.get(index);
}

function getMaskingBlocks(player) {
    var maskingList = [];
    var inventory = player.field_71071_by.field_70462_a;
    var isEmpty = true;
    var rowIndex = 9;//0:ホットバー 9:1段目 18:2段目 27:3段目
    if (isOldVer) {
        for (var i = 0; i < 9; i++) {
            var stack = inventory[i + rowIndex];
            if (stack && stack.func_77973_b() instanceof ItemBlock) {
                isEmpty = false;
                maskingList.push(stack.func_77973_b().field_150939_a);
            }
        }
    }
    else {
        for (var i = 0; i < 9; i++) {
            var stack = inventory[i + rowIndex];
            if (stack && stack.func_77973_b() instanceof ItemBlock) {
                isEmpty = false;
                maskingList.push(stack.func_77973_b().func_179223_d());
            }
        }
    }
    if (isEmpty) maskingList = [Blocks.field_150350_a];//Blocks.AIR
    return maskingList;
}

/*
blockSetListArray = [
    [ RotatableBlockSet, RotatableBlockSet... ], Z = 0
    [ RotatableBlockSet, RotatableBlockSet... ], Z = 1
    ...
]
*/
//Z軸方向にXY平面のデータ配列を配列に入れる(z軸をindex化)
function getBlockSetListArray(ngto, isPlaceAirBlock) {
    var blockSetListArray = [];
    var centerX = ngto.xSize / 2;
    var isEvenSize = ngto.xSize % 2 === 0;
    for (var zIdx = 0; zIdx < ngto.zSize; zIdx++) {
        //XY平面
        var blockSetList = [];
        for (var xIdx = 0; xIdx < ngto.xSize; xIdx++) {
            for (var yIdx = 0; yIdx < ngto.ySize; yIdx++) {
                var blockSet = ngto.getBlockSet(xIdx, yIdx, zIdx);
                if (isPlaceAirBlock || Block.func_149682_b(blockSet.block) !== 0) {//空気は除外
                    var xPos = isEvenSize ? xIdx + 0.5 : xIdx;
                    var rotatableBlockSet = new RotatableBlockSet(blockSet, xPos, yIdx, 0);
                    rotatableBlockSet.setAxisPos(centerX, 0, 0);
                    blockSetList.push(rotatableBlockSet);
                }
            }
        }
        blockSetListArray.push(blockSetList);
    }
    return blockSetListArray;
}

//[[BlockSet, x, y, z],...]
function rotationBlockSetList(blockSetListArray, zIndex, x, y, z, yaw, pitch) {
    var newBlockSetList = [];
    for (var i = 0; i < blockSetListArray[zIndex].length; i++) {
        var rotatableBlockSet = blockSetListArray[zIndex][i];
        var blockSet = rotatableBlockSet.blockSet;
        var pos = rotatableBlockSet.getRotationPos(x, y, z, yaw, pitch);
        newBlockSetList.push([blockSet, Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)]);
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
        vec = vec.rotateAroundY(90);
        vec = vec.rotateAroundZ(pitch);
        vec = vec.rotateAroundY(yaw);
        return {
            x: x + vec.getX(),
            y: y + vec.getY(),
            z: z + vec.getZ()
        }
    }
};

//###  3次元ベジェ曲線擬似クラス  ###
function BezierCurve3D(arg1, arg2, arg3, arg4) {
    if (arg4 === undefined) {
        var startPos = arg1;
        var handlePos = arg2;
        var endPos = arg3;
        this.p0 = startPos;
        this.p1 = lerpPoint(startPos, handlePos, 2 / 3);
        this.p2 = lerpPoint(endPos, handlePos, 2 / 3);
        this.p3 = endPos;
    }
    else {
        this.p0 = arg1;
        this.p1 = arg2;
        this.p2 = arg3;
        this.p3 = arg4;
    }
}

BezierCurve3D.prototype = {
    getPoint: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var t = index / split;
        var u = 1 - t;
        var point = [
            u * u * u * this.p0[0] + 3 * u * u * t * this.p1[0] + 3 * u * t * t * this.p2[0] + t * t * t * this.p3[0],
            u * u * u * this.p0[1] + 3 * u * u * t * this.p1[1] + 3 * u * t * t * this.p2[1] + t * t * t * this.p3[1],
            u * u * u * this.p0[2] + 3 * u * u * t * this.p1[2] + 3 * u * t * t * this.p2[2] + t * t * t * this.p3[2]
        ];
        return point;
    },
    getYaw: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var point1 = this.getPoint(index, split);
        var point2 = this.getPoint(index + 1, split);
        var dx = point2[0] - point1[0];
        var dz = point2[2] - point1[2];
        var yaw = Math.atan2(dz, dx);
        return yaw * (180 / Math.PI);
    },
    getPitch: function (index, split) {
        index = Math.min(Math.max(index, 0), split);
        var point1 = this.getPoint(index, split);
        var point2 = this.getPoint(index + 1, split);
        var dy = point2[1] - point1[1];
        var dx = point2[0] - point1[0];
        var dz = point2[2] - point1[2];
        var distance = Math.sqrt(dx * dx + dz * dz);
        var pitch = Math.atan2(dy, distance);
        return pitch * (180 / Math.PI);
    },
    getLength: function () {
        var dx = this.p3[0] - this.p0[0];
        var dy = this.p3[1] - this.p0[1];
        var dz = this.p3[2] - this.p0[2];
        //始点～終点直線距離の2倍を分割精度とする
        var distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var split = Math.ceil(distance * 2);
        var length = 0;
        var previousPoint = this.getPoint(0, split);
        for (var i = 1; i <= split; i++) {
            var currentPoint = this.getPoint(i, split);
            dx = currentPoint[0] - previousPoint[0];
            dy = currentPoint[1] - previousPoint[1];
            dz = currentPoint[2] - previousPoint[2];
            var segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
            length += segmentLength;
            previousPoint = currentPoint;
        }
        return length;
    },
    getStartAnchorLength: function () {
        var dx = this.p1[0] - this.p0[0];
        var dy = this.p1[1] - this.p0[1];
        var dz = this.p1[2] - this.p0[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    },
    getEndAnchorLength: function () {
        var dx = this.p3[0] - this.p2[0];
        var dy = this.p3[1] - this.p2[1];
        var dz = this.p3[2] - this.p2[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
};